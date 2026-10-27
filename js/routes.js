/* Rutas de patrullaje: editor sobre el mapa y evaluación contra el historial de incidentes. */
(function (MT) {
  'use strict';
  const D = MT.Data, G = MT.Geo;
  const { $, $$, icon, esc, fmt } = MT;
  const NEAR = 150; // metros a cada lado del recorrido
  const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const COLORS = ['#22d3ee', '#f59e0b', '#f472b6', '#34d399', '#a78bfa', '#60a5fa', '#f87171'];

  const R = MT.Routes = { map: null, layer: null, selected: 'R-01', draft: null, chart: null };

  // Rutas creadas por el usuario: se cargan una vez y se guardan en localStorage
  let userRoutes = null;
  const user = () => userRoutes || (userRoutes = MT.Store.get('routes', []));
  const saveUser = () => MT.Store.set('routes', user());
  R.all = function () { return D.ROUTES.concat(user()); };

  R.evaluate = function (route) {
    const path = route.path || route.points;
    const year = D.filter({ period: 'anio' });
    const near = year.filter(i => G.distToPath([i.lat, i.lng], path) <= NEAR);
    const length = G.pathLength(path);
    const inShift = near.filter(i => D.inHourRange(new Date(i.t).getHours(), route.start, route.end));
    const shiftLen = ((route.end - route.start) + 24) % 24 || 24;
    const peak = D.peakWindow(near, shiftLen);
    const types = {};
    near.forEach(i => { types[i.type] = (types[i.type] || 0) + 1; });
    return { near, length, perKm: near.length / Math.max(0.2, length / 1000), coverage: near.length ? inShift.length / near.length : 0, peak, shiftLen, types, laps: (shiftLen * 3600 * 7) / Math.max(1, length) };
  };

  /* ---------- Sección ---------- */
  let built = false;
  R.render = function () {
    const sec = $('#sec-rutas');
    if (!built) {
      built = true;
      sec.innerHTML = `<div class="split">
        <div class="split-side"><div class="page">
          <div><h2 style="font-size:18px">Rutas de patrullaje</h2><p class="muted" style="font-size:13px;margin-top:4px">Definí recorridos y compará su horario con el horario real de los incidentes cercanos (a menos de ${NEAR} m).</p></div>
          <button class="btn btn-primary" id="rt-new">${icon('plus', 15)} Nueva ruta</button>
          <div id="rt-editor" class="hidden"></div>
          <div class="stack" style="gap:8px" id="rt-list"></div>
          <div id="rt-eval"></div>
        </div></div>
        <div class="split-map"><div class="map-fill" id="map-routes"></div></div></div>`;
      R.map = MT.makeMap('map-routes', { zoom: 15 });
      R.heat = L.heatLayer(D.filter({ period: 'anio' }).map(i => [i.lat, i.lng, 0.4]), { radius: 20, blur: 22, max: 12, minOpacity: .1, gradient: { 0.3: '#1e3a8a', 0.6: '#f59e0b', 1: '#ef4444' } }).addTo(R.map);
      R.layer = L.layerGroup().addTo(R.map);
      R.draftLayer = L.layerGroup().addTo(R.map);
      $('#rt-new').onclick = startDraft;
      R.map.on('click', e => { if (R.draft) addPoint([e.latlng.lat, e.latlng.lng]); });
      document.addEventListener('mt:incidents', () => { if ($('#sec-rutas.active')) R.render(); });
    }
    setTimeout(() => R.map.invalidateSize(), 30);
    drawList();
    drawMap();
    drawEval();
  };

  function drawList() {
    $('#rt-list').innerHTML = R.all().map(r => {
      const ev = R.evaluate(r);
      const unit = MT.Patrols.get(r.unit);
      return `<div class="route-item ${r.id === R.selected ? 'sel' : ''}" style="--c:${r.color}" data-id="${r.id}">
        <div class="r1"><span>${esc(r.name)}</span><span class="tag ${ev.coverage >= .5 ? 'tag-ok' : ev.coverage >= .3 ? 'tag-warn' : 'tag-danger'}">${fmt.pct(ev.coverage)} en horario</span></div>
        <div class="r2"><span>${icon('clock', 12)} ${fmt.hourRange(r.start, r.end)}</span><span>${fmt.dist(ev.length)}</span><span>${ev.near.length} incid./año cerca</span><span>${unit ? esc(unit.name) : 'Sin móvil'}</span></div></div>`;
    }).join('');
    $$('#rt-list .route-item').forEach(el => el.onclick = () => { R.selected = el.dataset.id; drawList(); drawMap(); drawEval(true); });
  }

  function drawMap() {
    R.layer.clearLayers();
    R.all().forEach(r => {
      const sel = r.id === R.selected;
      L.polyline(r.path || r.points, { color: r.color, weight: sel ? 6 : 3, opacity: sel ? 1 : .45, dashArray: sel ? null : '6 8' })
        .bindTooltip(esc(r.name), { sticky: true }).on('click', () => { if (!R.draft) { R.selected = r.id; drawList(); drawMap(); drawEval(true); } }).addTo(R.layer);
      if (sel) L.polyline(r.path || r.points, { color: r.color, weight: NEAR / 2.2, opacity: .08, lineCap: 'round' }).addTo(R.layer);
    });
    const r = R.all().find(x => x.id === R.selected);
    if (r && r.snap && !r.path) snap(r);
  }

  // Ajusta el recorrido a las calles reales (si el servicio de ruteo responde)
  async function snap(r) {
    const res = await MT.Routing.get(r.points);
    if (res.source === 'osrm' && !r.path) { r.path = res.path; persist(r); drawList(); drawMap(); drawEval(); }
  }

  function drawEval(fit) {
    const r = R.all().find(x => x.id === R.selected);
    const box = $('#rt-eval');
    if (!r) { box.innerHTML = ''; return; }
    const ev = R.evaluate(r);
    if (fit) R.map.flyToBounds(L.latLngBounds(r.path || r.points).pad(0.25), { duration: .6 });
    const peakTxt = fmt.hourRange(ev.peak.start, ev.peak.start + ev.shiftLen);
    const good = ev.coverage >= 0.45;
    const topType = Object.entries(ev.types).sort((a, b) => b[1] - a[1])[0];
    const suggestion = good
      ? `El horario asignado (${fmt.hourRange(r.start, r.end)}) cubre el ${fmt.pct(ev.coverage)} de los incidentes del último año cerca de esta ruta. Buen ajuste.`
      : `Solo el ${fmt.pct(ev.coverage)} de los incidentes cercanos ocurre en el horario asignado (${fmt.hourRange(r.start, r.end)}). La franja con más casos es <b>${peakTxt}</b> (${fmt.pct(ev.peak.share)}). Conviene mover el recorrido a esa franja.`;
    const isUser = !D.ROUTES.find(x => x.id === r.id);
    box.innerHTML = `<div class="card card-body stack" style="gap:12px">
      <div class="row" style="justify-content:space-between"><h3 style="font-size:15px">${esc(r.name)}</h3>${isUser ? `<button class="icon-btn" id="rt-del" title="Eliminar ruta">${icon('trash', 16)}</button>` : ''}</div>
      <div class="eval-kpis">
        <div class="mini-stat"><b>${fmt.dist(ev.length)}</b><span>Longitud · ~${Math.round(ev.length / 7 / 60)} min por vuelta</span></div>
        <div class="mini-stat"><b>${ev.near.length}</b><span>Incidentes/año a ≤${NEAR} m</span></div>
        <div class="mini-stat"><b>${ev.perKm.toFixed(1).replace('.', ',')}</b><span>Incidentes por km</span></div>
        <div class="mini-stat"><b>${fmt.pct(ev.coverage)}</b><span>En el horario asignado</span></div>
      </div>
      <div class="suggest ${good ? '' : 'bad'}">${icon(good ? 'check' : 'alert', 16)}<span>${suggestion}</span></div>
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">Incidentes cercanos por hora del día <span class="dim">(resaltado = horario asignado)</span></div><div class="chart-box" style="height:170px"><canvas id="rt-chart"></canvas></div></div>
      ${topType ? `<div class="muted" style="font-size:12.5px">Delito más frecuente en el recorrido: <b style="color:var(--text)">${D.TYPES[topType[0]].label}</b> (${fmt.pct(topType[1] / ev.near.length)})</div>` : ''}
      <label class="field">Móvil asignado<div class="row"><select class="select" id="rt-unit">${MT.Patrols.units.map(u => `<option value="${u.id}" ${u.id === r.unit ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        <button class="btn btn-sm" id="rt-assign" title="El móvil pasa a recorrer esta ruta en el mapa operativo">${icon('car', 14)} Aplicar</button></div></label>
      ${!good ? `<button class="btn btn-sm btn-warn" id="rt-fix">${icon('clock', 14)} Ajustar horario a ${peakTxt}</button>` : ''}
      <div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" disabled ${r.days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
    </div>
    <div class="card card-body" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:10px">Comparación de rutas</h3>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Ruta</th><th>Horario</th><th>Inc./km</th><th>En horario</th></tr></thead><tbody>
      ${R.all().map(x => { const e = R.evaluate(x); return `<tr data-id="${x.id}"><td><span class="swatch" style="background:${x.color};display:inline-block;margin-right:6px"></span>${esc(x.name)}</td><td class="mono">${fmt.hourRange(x.start, x.end)}</td><td class="mono">${e.perKm.toFixed(1).replace('.', ',')}</td><td class="mono">${fmt.pct(e.coverage)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;

    if (R.chart) R.chart.destroy();
    R.chart = new Chart($('#rt-chart'), {
      type: 'bar',
      data: { labels: [...Array(24).keys()].map(h => String(h).padStart(2, '0')), datasets: [{ data: ev.peak.hours, backgroundColor: ev.peak.hours.map((_, h) => D.inHourRange(h, r.start, r.end) ? r.color : 'rgba(138,155,185,.35)'), borderRadius: 3 }] },
      options: MT.Stats.chartOpts({ legend: false })
    });
    $('#rt-assign').onclick = () => {
      r.unit = $('#rt-unit').value;
      persist(r);
      MT.Patrols.setLoop(r.unit, r.path || r.points);
      MT.toast({ title: 'Ruta asignada', msg: `${esc(MT.Patrols.get(r.unit).name)} ahora recorre "${esc(r.name)}" en el mapa operativo.`, level: 'ok' });
      drawList();
    };
    const fix = $('#rt-fix');
    if (fix) fix.onclick = () => {
      r.start = ev.peak.start; r.end = (ev.peak.start + ev.shiftLen) % 24;
      persist(r);
      MT.toast({ title: 'Horario actualizado', msg: `"${esc(r.name)}" pasa a ${fmt.hourRange(r.start, r.end)}.`, level: 'ok' });
      drawList(); drawEval();
    };
    const del = $('#rt-del');
    if (del) del.onclick = () => {
      userRoutes = user().filter(x => x.id !== r.id);
      saveUser();
      R.selected = 'R-01'; drawList(); drawMap(); drawEval(true);
    };
    $$('#rt-eval tr[data-id]').forEach(tr => tr.onclick = () => { R.selected = tr.dataset.id; drawList(); drawMap(); drawEval(true); });
  }

  // Guarda cambios: las rutas propias van a localStorage, las precargadas quedan en memoria
  function persist(r) {
    if (user().includes(r)) saveUser();
  }

  /* ---------- Editor ---------- */
  function startDraft() {
    const n = user().length;
    R.draft = { points: [], color: COLORS[(n + 3) % COLORS.length] };
    $('#rt-new').classList.add('hidden');
    const ed = $('#rt-editor');
    ed.classList.remove('hidden');
    ed.innerHTML = `<div class="card card-body stack">
      <div class="note note-info">${icon('crosshair', 15)}<span>Hacé clic en el mapa para marcar los puntos del recorrido, en orden.</span></div>
      <label class="field">Nombre<input class="input" id="dr-name" placeholder="Ej.: Barrio Sur nocturno"></label>
      <div class="row"><label class="field grow">Desde<select class="select" id="dr-start">${hourOpts(21)}</select></label><label class="field grow">Hasta<select class="select" id="dr-end">${hourOpts(1)}</select></label></div>
      <div class="days" id="dr-days">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" checked><span>${d}</span></label>`).join('')}</div>
      <label class="field">Móvil<select class="select" id="dr-unit">${MT.Patrols.units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="dr-snap"> Ajustar a las calles (respeta los sentidos de circulación)</label>
      <label class="check"><input type="checkbox" id="dr-closed" checked> Recorrido circular (vuelve al inicio)</label>
      <div class="muted" id="dr-info" style="font-size:12.5px">0 puntos</div>
      <div class="row"><button class="btn btn-sm" id="dr-undo">${icon('undo', 14)} Deshacer</button><button class="btn btn-sm btn-ghost" id="dr-cancel">Cancelar</button><button class="btn btn-sm btn-primary grow" id="dr-save">Guardar</button></div>
    </div>`;
    $('#dr-undo').onclick = () => { R.draft.points.pop(); drawDraft(); };
    $('#dr-cancel').onclick = endDraft;
    $('#dr-save').onclick = saveDraft;
    $('#dr-name').focus();
    drawDraft();
  }
  const hourOpts = sel => [...Array(24).keys()].map(h => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  function addPoint(p) { R.draft.points.push(p); drawDraft(); }
  function drawDraft() {
    R.draftLayer.clearLayers();
    const pts = R.draft.points;
    if (pts.length > 1) L.polyline(pts, { color: R.draft.color, weight: 4, dashArray: '6 6' }).addTo(R.draftLayer);
    pts.forEach(p => L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="wp-marker" style="--c:${R.draft.color}"></div>`, iconSize: [12, 12] }) }).addTo(R.draftLayer));
    const len = pts.length > 1 ? G.pathLength(pts) : 0;
    $('#dr-info').textContent = `${pts.length} puntos · ${fmt.dist(len)}`;
  }
  function endDraft() {
    R.draft = null;
    R.draftLayer.clearLayers();
    $('#rt-editor').classList.add('hidden');
    $('#rt-new').classList.remove('hidden');
  }
  async function saveDraft() {
    const pts = R.draft.points.slice();
    if (pts.length < 2) { MT.toast({ title: 'Faltan puntos', msg: 'Marcá al menos 2 puntos en el mapa.', level: 'warn' }); return; }
    if ($('#dr-closed').checked) pts.push(pts[0]);
    const r = {
      id: `R-U${Date.now().toString(36)}`, name: $('#dr-name').value.trim() || `Ruta ${user().length + 4}`,
      color: R.draft.color, unit: $('#dr-unit').value,
      start: Number($('#dr-start').value), end: Number($('#dr-end').value),
      days: $$('#dr-days input:checked').map(i => Number(i.value)), closed: $('#dr-closed').checked, points: pts
    };
    if ($('#dr-snap').checked) r.snap = true; else r.path = pts;
    user().push(r); saveUser();
    endDraft();
    R.selected = r.id;
    drawList(); drawMap(); drawEval(true);
    MT.toast({ title: 'Ruta guardada', msg: `"${esc(r.name)}" — revisá la evaluación por horario.`, level: 'ok' });
  }
})(window.MT);
