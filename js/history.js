/* Mapa histórico: incidentes de la semana, el mes, el año o un rango, con mapa de calor y filtros. Sin móviles (solo existen en vivo). */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  const H = MT.History = {
    map: null,
    layers: {},
    filter: { period: 'mes', types: new Set(Object.keys(D.TYPES)), franja: 'all', zone: 'all', from: null, to: null },
    visible: { incidents: true, heat: true, cameras: false, coverage: false, pois: false }
  };
  const PERIOD_LABEL = { semana: 'la última semana', mes: 'el último mes', trimestre: 'los últimos 90 días', anio: 'el último año', custom: 'el rango elegido' };

  let built = false;
  H.render = function () {
    const sec = $('#sec-historico');
    if (!built) { built = true; build(sec); }
    setTimeout(() => { H.map.invalidateSize(); H.draw(); }, 30);
  };

  function build(sec) {
    sec.innerHTML = '<div class="map-fill" id="map-hist"></div>';
    const map = H.map = MT.makeMap('map-hist', { zoom: 15 });
    map.zoomControl.setPosition('bottomleft');
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    const L_ = H.layers;
    L_.incidents = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45, disableClusteringAtZoom: 18,
      iconCreateFunction(c) {
        const n = c.getChildCount();
        const cls = n >= 30 ? '' : n >= 10 ? 'md' : 'sm';
        const s = n >= 30 ? 44 : n >= 10 ? 38 : 32;
        return L.divIcon({ className: '', html: `<div class="cluster ${cls}" style="width:${s}px;height:${s}px">${n}</div>`, iconSize: [s, s] });
      }
    });
    L_.heat = L.heatLayer([], { radius: 26, blur: 22, maxZoom: 17, minOpacity: 0.3, gradient: { 0.2: '#1e3a8a', 0.45: '#06b6d4', 0.65: '#facc15', 0.85: '#f97316', 1: '#ef4444' } });
    L_.cameras = L.layerGroup();
    L_.coverage = L.layerGroup();
    L_.pois = L.layerGroup();
    MT.Cameras.cams.forEach(cam => {
      L.marker(cam.pos, { icon: L.divIcon({ className: '', html: `<div class="cam-marker ${cam.status}">${icon('video', 15)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })
        .bindTooltip(`${cam.id} · ${esc(cam.name)}`, { direction: 'top', offset: [0, -14] }).on('click', () => MT.Cameras.open(cam.id)).addTo(L_.cameras);
      L.circle(cam.pos, { radius: cam.range, color: cam.status === 'online' ? '#22d3ee' : '#64748b', weight: 1, fillOpacity: .12, dashArray: cam.status === 'online' ? null : '4 4' }).addTo(L_.coverage);
    });
    D.POIS.forEach(p => {
      const letter = { salud: 'H', seguridad: 'C', gobierno: 'M', educacion: 'E', transporte: 'T' }[p.kind];
      L.marker(p.pos, { icon: L.divIcon({ className: '', html: `<div class="poi-marker">${letter}</div>`, iconSize: [22, 22] }) })
        .bindTooltip(p.name, { direction: 'top', offset: [0, -10] }).addTo(L_.pois);
    });
    Object.keys(H.visible).forEach(k => { if (H.visible[k]) map.addLayer(L_[k]); });

    const T = D.TYPES;
    const panel = MT.h(`<aside class="map-panel left" style="top:12px">
      <div class="panel-tabs"><button class="active" style="justify-content:flex-start;padding-left:8px">${icon('layers', 15)} Historial de casos</button>
        <button class="icon-btn" data-close style="flex:0 0 34px" aria-label="Ocultar panel">${icon('x', 15)}</button></div>
      <div class="panel-scroll">
        <div class="panel-sec"><h4>Período</h4>
          <div class="seg" id="h-period" style="display:flex">
            <button data-v="semana">Semana</button><button data-v="mes" class="active">Mes</button><button data-v="trimestre">90 días</button><button data-v="anio">Año</button><button data-v="custom">Rango</button></div>
          <div class="row hidden" id="h-range" style="margin-top:8px"><input type="date" class="input" id="h-from"><input type="date" class="input" id="h-to"></div>
        </div>
        <div class="panel-sec"><h4>Resumen</h4><div id="h-summary"></div></div>
        <div class="panel-sec"><h4>Capas</h4>
          ${[['incidents', 'Incidentes', 'pin'], ['heat', 'Mapa de calor', 'target'], ['cameras', 'Cámaras', 'video'], ['coverage', 'Cobertura de cámaras', 'eye'], ['pois', 'Puntos de interés (aprox.)', 'flag']]
            .map(([k, l, i]) => `<label class="check layer-row"><span class="row" style="gap:9px"><input type="checkbox" data-hlayer="${k}" ${H.visible[k] ? 'checked' : ''}>${icon(i, 15, 'dim')}${l}</span></label>`).join('')}
        </div>
        <div class="panel-sec"><h4>Tipo de incidente <button class="btn btn-ghost btn-xs" id="h-types-all">Todos</button></h4>
          ${Object.entries(T).map(([k, t]) => `<label class="check"><input type="checkbox" data-htype="${k}" checked><span class="swatch" style="background:${t.color}"></span>${t.label}</label>`).join('')}
        </div>
        <div class="panel-sec stack"><h4>Más filtros</h4>
          <label class="field">Franja horaria<select class="select" id="h-franja"><option value="all">Todo el día</option><option value="manana">Mañana (06–12)</option><option value="tarde">Tarde (12–20)</option><option value="noche">Noche (20–01)</option><option value="madrugada">Madrugada (01–06)</option></select></label>
          <label class="field">Zona<select class="select" id="h-zone"><option value="all">Todas las zonas</option>${Object.entries(D.ZONES).map(([k, z]) => `<option value="${k}">${z.name}</option>`).join('')}</select></label>
        </div>
        <div class="panel-sec stack" style="gap:8px">
          <div class="seg" id="h-base"><button data-v="dark" class="active">Oscuro</button><button data-v="calles">Calles</button><button data-v="satelite">Satélite</button></div>
          <button class="btn btn-sm btn-block" id="h-csv">${icon('download', 14)} Exportar estos casos (CSV)</button>
        </div>
      </div></aside>`);
    const tg = MT.h(`<div class="panel-toggle left hidden" style="top:12px"><button class="btn btn-sm">${icon('layers', 15)} Historial y filtros</button></div>`);
    sec.append(panel, tg);
    MT.setupPanel(sec, panel, tg, 'left');

    const f = H.filter;
    const readRange = () => {
      const a = $('#h-from').value, b = $('#h-to').value;
      f.from = a ? new Date(a + 'T00:00').getTime() : null;
      f.to = b ? new Date(b + 'T23:59').getTime() : null;
    };
    $$('#h-period button').forEach(b => b.onclick = () => {
      $$('#h-period button').forEach(x => x.classList.toggle('active', x === b));
      f.period = b.dataset.v;
      $('#h-range').classList.toggle('hidden', f.period !== 'custom');
      if (f.period === 'custom') {
        const iso = d => d.toISOString().slice(0, 10);
        if (!$('#h-from').value) $('#h-from').value = iso(new Date(Date.now() - 60 * 86400000));
        if (!$('#h-to').value) $('#h-to').value = iso(new Date());
        readRange();
      }
      H.draw();
    });
    ['#h-from', '#h-to'].forEach(s => $(s).onchange = () => { readRange(); H.draw(); });
    $$('[data-hlayer]', panel).forEach(cb => cb.onchange = () => {
      H.visible[cb.dataset.hlayer] = cb.checked;
      cb.checked ? map.addLayer(L_[cb.dataset.hlayer]) : map.removeLayer(L_[cb.dataset.hlayer]);
      if (cb.checked && cb.dataset.hlayer === 'heat') H.draw();
    });
    $$('[data-htype]', panel).forEach(cb => cb.onchange = () => {
      cb.checked ? f.types.add(cb.dataset.htype) : f.types.delete(cb.dataset.htype);
      H.draw();
    });
    $('#h-types-all').onclick = () => {
      const all = f.types.size < Object.keys(T).length;
      $$('[data-htype]', panel).forEach(cb => { cb.checked = all; all ? f.types.add(cb.dataset.htype) : f.types.delete(cb.dataset.htype); });
      H.draw();
    };
    $('#h-franja').onchange = e => { f.franja = e.target.value; H.draw(); };
    $('#h-zone').onchange = e => { f.zone = e.target.value; H.draw(); };
    $$('#h-base button').forEach(b => b.onclick = () => {
      $$('#h-base button').forEach(x => x.classList.toggle('active', x === b));
      map.setBase(b.dataset.v);
    });
    $('#h-csv').onclick = () => MT.Stats.exportCSV(D.filter(f), `historico_${f.period}`);
    document.addEventListener('mt:incidents', () => { if ($('#sec-historico.active')) H.draw(); });
  }

  H.draw = function () {
    if (!H.map || $('#sec-historico').offsetParent === null) return; // el calor necesita el mapa visible
    const list = D.filter(H.filter);
    H.layers.incidents.clearLayers();
    H.markers = {};
    H.layers.incidents.addLayers(list.map(inc => (H.markers[inc.id] = L.marker([inc.lat, inc.lng], { icon: MT.incidentIcon(inc) }).bindPopup(() => MT.incidentPopup(inc)))));
    H.layers.heat.setOptions({ max: Math.max(1.5, Math.min(6, list.length / 60)) });
    H.layers.heat.setLatLngs(list.map(i => [i.lat, i.lng, 0.6]));
    summary(list);
  };

  function summary(list) {
    const f = H.filter;
    const [a, b] = D.periodRange(f.period, f.from, f.to);
    const prev = D.filter(Object.assign({}, f, { period: 'custom', from: a - (b - a), to: a }));
    const delta = prev.length ? (list.length - prev.length) / prev.length : 0;
    const zones = {};
    list.forEach(i => { zones[i.zone] = (zones[i.zone] || 0) + 1; });
    const topZone = Object.entries(zones).sort((x, y) => y[1] - x[1])[0];
    const peak = D.peakWindow(list, 3);
    $('#h-summary').innerHTML = `<div class="mini-stats">
      <div class="mini-stat"><b>${list.length}</b><span>Incidentes en ${PERIOD_LABEL[f.period]}</span></div>
      <div class="mini-stat"><b class="${delta > 0 ? 'delta-up' : 'delta-down'}">${prev.length ? (delta > 0 ? '▲ ' : '▼ ') + fmt.pct(Math.abs(delta)) : '—'}</b><span>vs. período anterior</span></div>
      <div class="mini-stat" style="grid-column:span 2"><b style="font-size:14px;font-family:var(--font)">${topZone ? esc(D.ZONES[topZone[0]].name) : '—'}</b><span>Zona más afectada ${topZone ? `(${topZone[1]} casos, ${fmt.pct(topZone[1] / list.length)})` : ''}</span></div>
      <div class="mini-stat" style="grid-column:span 2"><b style="font-size:14px;font-family:var(--font)">${list.length ? fmt.hourRange(peak.start, peak.end) : '—'}</b><span>Franja horaria con más casos ${list.length ? `(${fmt.pct(peak.share)})` : ''}</span></div>
    </div>`;
  }

  // Abre un incidente viejo: amplía el período si hace falta para que se vea
  H.showIncident = function (inc) {
    MT.App.go('historico');
    const f = H.filter;
    if (!D.filter(Object.assign({}, f, { types: null, franja: 'all', zone: 'all' })).includes(inc)) {
      f.period = 'anio';
      $$('#h-period button').forEach(x => x.classList.toggle('active', x.dataset.v === 'anio'));
      $('#h-range').classList.add('hidden');
    }
    f.types.add(inc.type); f.franja = 'all'; f.zone = 'all';
    $$('[data-htype]').forEach(cb => { if (cb.dataset.htype === inc.type) cb.checked = true; });
    $('#h-franja').value = 'all'; $('#h-zone').value = 'all';
    setTimeout(() => {
      H.draw();
      H.map.flyTo([inc.lat, inc.lng], 18, { duration: .8 });
      setTimeout(() => L.popup().setLatLng([inc.lat, inc.lng]).setContent(MT.incidentPopup(inc)).openOn(H.map), 900);
    }, 80);
  };
})(window.MT);
