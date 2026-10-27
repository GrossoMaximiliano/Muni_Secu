/* Análisis y planificación: zonas críticas, recomendaciones por reglas, simulador de cobertura e informe. */
(function (MT) {
  'use strict';
  const D = MT.Data, G = MT.Geo;
  const { $, $$, icon, esc, fmt } = MT;
  const CELL = 0.0018; // ~200 m
  const NIGHT = h => h >= 20 || h < 5;

  const A = MT.Analysis = { period: 'trimestre', map: null, show: { cells: true, coverage: true, heat: false }, sims: [] };

  function cellsOf(list) {
    const [[s, w]] = D.BOUNDS;
    const cells = {};
    list.forEach(i => {
      const r = Math.floor((i.lat - s) / CELL), c = Math.floor((i.lng - w) / (CELL * 1.13));
      const k = r + ':' + c;
      (cells[k] = cells[k] || { r, c, items: [] }).items.push(i);
    });
    return Object.values(cells).map(cell => {
      const lat0 = s + cell.r * CELL, lng0 = w + cell.c * CELL * 1.13;
      cell.bounds = [[lat0, lng0], [lat0 + CELL, lng0 + CELL * 1.13]];
      cell.center = [lat0 + CELL / 2, lng0 + CELL * 1.13 / 2];
      cell.n = cell.items.length;
      return cell;
    }).sort((a, b) => b.n - a.n);
  }

  function describe(cell) {
    const DAY = 86400000, now = Date.now();
    const last30 = cell.items.filter(i => now - i.t < 30 * DAY).length;
    const prev30 = cell.items.filter(i => now - i.t >= 30 * DAY && now - i.t < 60 * DAY).length;
    const types = {};
    cell.items.forEach(i => { types[i.type] = (types[i.type] || 0) + 1; });
    const top = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    const peak = D.peakWindow(cell.items, 4);
    const night = cell.items.filter(i => NIGHT(new Date(i.t).getHours())).length / cell.n;
    const cams = MT.Cameras.cams.filter(c => G.dist(c.pos, cell.center) < 160);
    return { last30, prev30, topType: top[0], topShare: top[1] / cell.n, peak, night, cams, camsOnline: cams.filter(c => c.status === 'online'), addr: D.address(cell.center[0], cell.center[1]), zone: D.zoneOf(cell.center[0], cell.center[1]) };
  }

  /* ---------- Recomendaciones (reglas simples y explicables) ---------- */
  A.recommendations = function (list, cells) {
    const recs = [];
    cells.slice(0, 5).forEach((cell, idx) => {
      const d = describe(cell);
      if (!d.camsOnline.length) {
        const off = d.cams.find(c => c.status === 'offline');
        recs.push(off
          ? { p: 'alta', ic: 'video', t: `Reparar la cámara ${off.id} (${off.name})`, d: `Está fuera de línea en la zona crítica #${idx + 1}, con ${cell.n} incidentes en el período.`, pos: off.pos }
          : { p: 'alta', ic: 'video', t: `Instalar una cámara cerca de ${d.addr}`, d: `Zona crítica #${idx + 1}: ${cell.n} incidentes en el período y ninguna cámara a menos de 160 m. Delito principal: ${D.TYPES[d.topType].label.toLowerCase()}.`, pos: cell.center });
      }
      if (d.night >= 0.55 && cell.n >= 6) recs.push({ p: 'media', ic: 'sun', t: `Revisar la iluminación en ${d.addr}`, d: `El ${fmt.pct(d.night)} de los hechos de esta zona ocurre de noche (20 a 5 h). Mejor iluminación y poda reducen las oportunidades.`, pos: cell.center });
    });
    // Zona con más casos nocturnos → patrullaje
    const byZone = {};
    list.forEach(i => { (byZone[i.zone] = byZone[i.zone] || []).push(i); });
    const nightZone = Object.entries(byZone).map(([z, l]) => [z, l.filter(i => NIGHT(new Date(i.t).getHours())).length, l]).sort((a, b) => b[1] - a[1])[0];
    if (nightZone && nightZone[1] > 3) {
      const pk = D.peakWindow(nightZone[2], 4);
      recs.push({ p: 'alta', ic: 'car', t: `Reforzar el patrullaje en ${D.ZONES[nightZone[0]].name} entre ${fmt.hourRange(pk.start, pk.end)}`, d: `Concentra la mayor cantidad de hechos nocturnos (${nightZone[1]}). En esa franja ocurre el ${fmt.pct(pk.share)} de los casos de la zona.` });
    }
    // Tipo en aumento (90 días vs. 90 anteriores)
    const DAY = 86400000, now = Date.now(), all = D.incidents();
    const growth = Object.keys(D.TYPES).map(t => {
      const a = all.filter(i => i.type === t && now - i.t < 90 * DAY).length;
      const b = all.filter(i => i.type === t && now - i.t >= 90 * DAY && now - i.t < 180 * DAY).length;
      return [t, a, b, b ? (a - b) / b : 0];
    }).sort((x, y) => y[3] - x[3])[0];
    if (growth && growth[3] > 0.1 && growth[1] >= 8) {
      const tips = { vivienda: 'Charlas de prevención, alarmas comunitarias y relevamiento de viviendas vulnerables.', moto: 'Registro municipal de motos y bicicletas con grabado de cuadro y operativos de control.', via_publica: 'Paradas seguras, más presencia en horarios de entrada y salida escolar.', comercio: 'Red de botones de alerta para comercios conectada al Centro de Monitoreo.', vandalismo: 'Reparación rápida de luminarias y espacios públicos.', otro: 'Mesas de trabajo barriales y mediación comunitaria.' };
      recs.push({ p: 'media', ic: 'trend', t: `${D.TYPES[growth[0]].label}: aumento de ${fmt.pct(growth[3])}`, d: `${growth[1]} casos en los últimos 90 días contra ${growth[2]} en los 90 anteriores. Sugerencia: ${tips[growth[0]]}` });
    }
    // Rutas con horario desfasado
    MT.Routes.all().forEach(r => {
      const ev = MT.Routes.evaluate(r);
      if (ev.near.length >= 10 && ev.coverage < 0.35) recs.push({ p: 'media', ic: 'route', t: `Cambiar el horario de la ruta "${r.name}"`, d: `Hoy cubre ${fmt.hourRange(r.start, r.end)}, pero la mayoría de los hechos cercanos ocurre entre ${fmt.hourRange(ev.peak.start, ev.peak.start + ev.shiftLen)}. Solo el ${fmt.pct(ev.coverage)} cae en su horario.`, route: r.id });
    });
    const order = { alta: 0, media: 1, baja: 2 };
    return recs.sort((a, b) => order[a.p] - order[b.p]);
  };

  /* ---------- Sección ---------- */
  let built = false;
  A.render = function () {
    const sec = $('#sec-analisis');
    if (!built) {
      built = true;
      sec.innerHTML = `<div class="page">
        <div class="page-head"><div><h2>Análisis y planificación</h2><p>Dónde se concentran los hechos, qué conviene hacer y cuánto mejoraría la cobertura con una cámara o un punto fijo nuevo.</p></div>
          <div class="toolbar"><div class="seg" id="an-period"><button data-v="mes">30 días</button><button data-v="trimestre">90 días</button><button data-v="anio">12 meses</button></div>
            <button class="btn btn-sm" id="an-csv">${icon('download', 14)} CSV</button><button class="btn btn-sm btn-primary" id="an-print">${icon('printer', 14)} Informe imprimible</button></div></div>
        <div class="grid-3">
          <div class="card" style="overflow:hidden"><div class="card-head" style="padding-bottom:12px;flex-wrap:wrap">
              <div class="row row-wrap" style="gap:4px 14px">
                <label class="check"><input type="checkbox" data-show="cells" checked> Celdas críticas (~200 m)</label>
                <label class="check"><input type="checkbox" data-show="coverage" checked> Cobertura de cámaras</label>
                <label class="check"><input type="checkbox" data-show="heat"> Mapa de calor</label></div></div>
            <div style="position:relative;height:520px"><div class="map-fill" id="map-analysis"></div></div></div>
          <div class="card"><div class="card-head"><h3>${icon('target', 16)} Zonas críticas</h3><span class="sub">top 5</span></div><div class="card-body stack" style="gap:8px" id="an-top"></div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-head"><h3>${icon('zap', 16)} Recomendaciones</h3><span class="tag tag-info">Reglas automáticas</span></div><div class="card-body stack" style="gap:10px" id="an-recs"></div></div>
          <div class="card"><div class="card-head"><h3>${icon('crosshair', 16)} Simulador de cobertura</h3></div><div class="card-body stack" id="an-sim"></div></div>
        </div></div>`;
      A.map = MT.makeMap('map-analysis', { zoom: 15 });
      A.cellsLayer = L.layerGroup().addTo(A.map);
      A.covLayer = L.layerGroup().addTo(A.map);
      A.heat = L.heatLayer([], { radius: 24, blur: 20, max: 3, minOpacity: .25 });
      A.simLayer = L.layerGroup().addTo(A.map);
      MT.Cameras.cams.forEach(c => {
        L.circle(c.pos, { radius: c.range, color: c.status === 'online' ? '#22d3ee' : '#64748b', weight: 1, fillOpacity: .1, dashArray: c.status === 'online' ? null : '4 4' }).addTo(A.covLayer);
        L.circleMarker(c.pos, { radius: 3, color: c.status === 'online' ? '#22d3ee' : '#64748b', fillOpacity: 1 }).bindTooltip(`${c.id} · ${esc(c.name)}`).addTo(A.covLayer);
      });
      $$('#an-period button').forEach(b => b.onclick = () => { A.period = b.dataset.v; A.render(); });
      $$('[data-show]', sec).forEach(cb => cb.onchange = () => {
        A.show[cb.dataset.show] = cb.checked;
        const layer = { cells: A.cellsLayer, coverage: A.covLayer, heat: A.heat }[cb.dataset.show];
        cb.checked ? A.map.addLayer(layer) : A.map.removeLayer(layer);
      });
      $('#an-csv').onclick = () => MT.Stats.exportCSV(D.filter({ period: A.period }), `incidentes_analisis_${A.period}`);
      $('#an-print').onclick = printReport;
      A.map.on('click', e => { if (A.placing) placeSim([e.latlng.lat, e.latlng.lng]); });
      document.addEventListener('mt:incidents', () => { if ($('#sec-analisis.active')) A.render(); });
    }
    setTimeout(() => A.map.invalidateSize(), 30);
    $$('#an-period button').forEach(b => b.classList.toggle('active', b.dataset.v === A.period));

    const list = D.filter({ period: A.period });
    const cells = cellsOf(list);
    A.lastCells = cells;
    const max = cells[0] ? cells[0].n : 1;
    A.cellsLayer.clearLayers();
    cells.filter(c => c.n >= Math.max(2, max * 0.15)).forEach(c => {
      const v = c.n / max;
      const col = v > .66 ? '#ef4444' : v > .4 ? '#f97316' : v > .25 ? '#f59e0b' : '#3b82f6';
      L.rectangle(c.bounds, { color: col, weight: 1, fillColor: col, fillOpacity: 0.12 + v * 0.4 }).bindTooltip(`${c.n} incidentes · ${esc(D.address(c.center[0], c.center[1]))}`).addTo(A.cellsLayer);
    });
    cells.slice(0, 5).forEach((c, i) => L.marker(c.center, { icon: L.divIcon({ className: '', html: `<div class="zone-row" style="padding:0;border:0;background:none;display:block"><div class="n" style="box-shadow:0 0 0 2px #0a111e">${i + 1}</div></div>`, iconSize: [26, 26] }), interactive: false }).addTo(A.cellsLayer));
    A.heat.setLatLngs(list.map(i => [i.lat, i.lng, 0.6]));

    $('#an-top').innerHTML = cells.slice(0, 5).map((c, i) => {
      const d = describe(c);
      const diff = d.last30 - d.prev30; // diferencia absoluta: con pocos casos un % exagera
      return `<div class="zone-row" data-i="${i}"><span class="n">${i + 1}</span>
        <div><b>${esc(d.addr)}</b><div class="muted" style="font-size:11.5px">${esc(D.ZONES[d.zone].name)} · ${D.TYPES[d.topType].short} ${fmt.pct(d.topShare)} · pico ${fmt.hourRange(d.peak.start, d.peak.end)}</div>
        <div class="muted" style="font-size:11.5px">${d.camsOnline.length ? `${icon('video', 11)} ${d.camsOnline.length} cámara(s) cerca` : '<span style="color:#fca5a5">Sin cámaras en línea cerca</span>'}</div></div>
        <div style="text-align:right"><b class="mono" style="font-size:16px">${c.n}</b><div class="${diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'dim'} mono" style="font-size:11px" title="Últimos 30 días: ${d.last30} · 30 anteriores: ${d.prev30}">${diff > 0 ? '▲ +' + diff : diff < 0 ? '▼ ' + diff : '= 0'}</div></div></div>`;
    }).join('') + `<p class="dim" style="font-size:11.5px">Tendencia: casos de los últimos 30 días menos los de los 30 anteriores.</p>`;
    $$('#an-top .zone-row').forEach(r => r.onclick = () => A.map.flyTo(cells[r.dataset.i].center, 17, { duration: .6 }));

    const recs = A.recommendations(list, cells);
    A.lastRecs = recs;
    $('#an-recs').innerHTML = recs.map((r, i) => `<div class="rec p-${r.p}"><div class="ic-wrap">${icon(r.ic, 17)}</div><div><strong>${esc(r.t)}</strong><p>${esc(r.d)}</p></div>
      <div class="stack" style="gap:6px;justify-items:end"><span class="tag ${r.p === 'alta' ? 'tag-danger' : 'tag-warn'}">${r.p}</span>${r.pos ? `<button class="btn btn-xs" data-rec="${i}">${icon('pin', 12)} Ver</button>` : ''}${r.route ? `<button class="btn btn-xs" data-route="${r.route}">${icon('route', 12)} Abrir</button>` : ''}</div></div>`).join('')
      || '<div class="empty">Sin recomendaciones para este período.</div>';
    $$('#an-recs [data-rec]').forEach(b => b.onclick = () => { A.map.flyTo(recs[b.dataset.rec].pos, 17, { duration: .6 }); window.scrollTo(0, 0); $('#sec-analisis').scrollTo({ top: 0, behavior: 'smooth' }); });
    $$('#an-recs [data-route]').forEach(b => b.onclick = () => { MT.Routes.selected = b.dataset.route; MT.App.go('rutas'); });
    renderSim();
  };

  /* ---------- Simulador ---------- */
  function renderSim() {
    const year = D.filter({ period: 'anio' });
    const cams = MT.Cameras.cams.filter(c => c.status === 'online');
    const coveredNow = year.filter(i => cams.some(c => G.dist([i.lat, i.lng], c.pos) <= c.range));
    const coveredSim = year.filter(i => !coveredNow.includes(i) && A.sims.some(s => G.dist([i.lat, i.lng], s.pos) <= s.radius));
    const total = year.length || 1;
    $('#an-sim').innerHTML = `<p class="muted" style="font-size:12.5px">Colocá cámaras o puntos de patrullaje fijo en el mapa y mirá cuántos hechos del último año habrían quedado dentro de su alcance.</p>
      <div class="row row-wrap"><button class="btn btn-sm ${A.placing === 'cam' ? 'btn-primary' : ''}" data-place="cam">${icon('video', 14)} Agregar cámara (80 m)</button>
        <button class="btn btn-sm ${A.placing === 'fijo' ? 'btn-primary' : ''}" data-place="fijo">${icon('flag', 14)} Punto fijo (250 m)</button>
        ${A.sims.length ? `<button class="btn btn-sm btn-ghost" id="sim-clear">${icon('trash', 14)} Limpiar</button>` : ''}</div>
      ${A.placing ? `<div class="note note-info">${icon('crosshair', 15)}<span>Hacé clic en el mapa de arriba para ubicarlo.</span></div>` : ''}
      <div class="eval-kpis">
        <div class="mini-stat"><b>${fmt.pct(coveredNow.length / total)}</b><span>Hechos cubiertos hoy por cámaras</span></div>
        <div class="mini-stat"><b style="color:${coveredSim.length ? '#86efac' : 'inherit'}">${fmt.pct((coveredNow.length + coveredSim.length) / total)}</b><span>Con lo simulado ${coveredSim.length ? `(+${coveredSim.length} hechos)` : ''}</span></div>
      </div>
      ${A.sims.length ? `<div class="sim-list">${A.sims.map((s, i) => `<div><span>${s.kind === 'cam' ? 'Cámara' : 'Punto fijo'} ${i + 1} · ${esc(D.address(s.pos[0], s.pos[1]))}</span><b class="mono">${year.filter(x => G.dist([x.lat, x.lng], s.pos) <= s.radius).length} hechos</b></div>`).join('')}</div>` : ''}
      <p class="dim" style="font-size:11.5px">Alcance aproximado. La ubicación final de una cámara requiere relevamiento en el lugar (visibilidad, poste, energía y enlace).</p>`;
    $$('#an-sim [data-place]').forEach(b => b.onclick = () => { A.placing = A.placing === b.dataset.place ? null : b.dataset.place; renderSim(); });
    const clr = $('#sim-clear');
    if (clr) clr.onclick = () => { A.sims = []; A.simLayer.clearLayers(); renderSim(); };
  }
  function placeSim(pos) {
    const kind = A.placing;
    const radius = kind === 'cam' ? 80 : 250;
    A.sims.push({ kind, pos, radius });
    L.circle(pos, { radius, color: '#22c55e', weight: 2, dashArray: '5 5', fillOpacity: .12 }).addTo(A.simLayer);
    L.circleMarker(pos, { radius: 5, color: '#22c55e', fillOpacity: 1 }).addTo(A.simLayer);
    A.placing = null;
    renderSim();
  }

  /* ---------- Informe imprimible ---------- */
  function printReport() {
    const list = D.filter({ period: A.period });
    const cells = A.lastCells || [];
    const recs = A.lastRecs || [];
    const L_ = { mes: 'últimos 30 días', trimestre: 'últimos 90 días', anio: 'últimos 12 meses' }[A.period];
    const types = Object.keys(D.TYPES).map(t => [D.TYPES[t].label, list.filter(i => i.type === t).length]).sort((a, b) => b[1] - a[1]);
    const zones = Object.keys(D.ZONES).map(z => [D.ZONES[z].name, list.filter(i => i.zone === z).length]).sort((a, b) => b[1] - a[1]);
    const peak = D.peakWindow(list, 4);
    $('#print-report').innerHTML = `<h1>Informe de seguridad urbana – Las Toscas</h1>
      <p>Período: ${L_} · Generado el ${fmt.dateTime(Date.now())} · Centro de Monitoreo Municipal</p>
      <p><i>Documento de demostración: los datos son simulados.</i></p>
      <h2>Resumen</h2>
      <span class="kp"><b>${list.length}</b> incidentes</span><span class="kp">Franja con más casos: <b>${fmt.hourRange(peak.start, peak.end)}</b> (${fmt.pct(peak.share)})</span><span class="kp">Zona más afectada: <b>${esc(zones[0][0])}</b></span>
      <h2>Por tipo</h2><table><tr><th>Tipo</th><th>Casos</th><th>%</th></tr>${types.map(t => `<tr><td>${t[0]}</td><td>${t[1]}</td><td>${list.length ? fmt.pct(t[1] / list.length) : ''}</td></tr>`).join('')}</table>
      <h2>Por zona</h2><table><tr><th>Zona</th><th>Casos</th></tr>${zones.map(z => `<tr><td>${esc(z[0])}</td><td>${z[1]}</td></tr>`).join('')}</table>
      <h2>Zonas críticas (celdas de ~200 m)</h2><table><tr><th>#</th><th>Referencia</th><th>Casos</th><th>Delito principal</th><th>Horario pico</th></tr>
      ${cells.slice(0, 5).map((c, i) => { const d = describe(c); return `<tr><td>${i + 1}</td><td>${esc(d.addr)}</td><td>${c.n}</td><td>${D.TYPES[d.topType].label}</td><td>${fmt.hourRange(d.peak.start, d.peak.end)}</td></tr>`; }).join('')}</table>
      <h2>Recomendaciones</h2><ol>${recs.map(r => `<li><b>${esc(r.t)}</b> — ${esc(r.d)}</li>`).join('')}</ol>`;
    window.print();
  }
})(window.MT);
