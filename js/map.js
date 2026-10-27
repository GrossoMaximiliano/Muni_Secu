/* Mapa operativo: capas base, incidentes (clusters + calor), filtros, resumen y paneles. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  /* ---------- Fábrica de mapas (se reutiliza en Rutas y Análisis) ---------- */
  let tileWarned = false;
  MT.makeMap = function (el, opts = {}) {
    const map = L.map(el, { minZoom: 13, maxZoom: 19, zoomControl: true }).setView(opts.center || D.CENTER, opts.zoom || 15);
    const bases = {
      // Mapa oscuro: las mismas teselas de OpenStreetMap invertidas por CSS (no requiere clave)
      dark: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles-dark', attribution: '&copy; colaboradores de OpenStreetMap' }),
      calles: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores de OpenStreetMap' }),
      satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes &copy; Esri' })
    };
    let errors = 0;
    Object.values(bases).forEach(l => l.on('tileerror', () => {
      if (++errors === 8 && !tileWarned) {
        tileWarned = true;
        MT.toast({ title: 'No se pudo cargar el mapa base', msg: 'Revisá la conexión a internet. El resto del sistema sigue funcionando.', level: 'warn', timeout: 10000 });
      }
    }));
    map._bases = bases;
    map.setBase = key => { Object.values(bases).forEach(l => map.removeLayer(l)); bases[key].addTo(map); };
    map.setBase(opts.base || 'dark');
    return map;
  };

  MT.incidentIcon = function (inc) {
    const recent = Date.now() - inc.t < 86400000;
    return L.divIcon({ className: '', html: `<div class="inc-dot ${recent ? 'recent' : ''}" style="--c:${D.TYPES[inc.type].color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
  };
  const STATUS = { abierto: ['Abierto', 'tag-danger'], investigacion: ['En investigación', 'tag-warn'], cerrado: ['Cerrado', 'tag-ok'] };
  MT.statusTag = s => `<span class="tag ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
  MT.incidentPopup = function (inc) {
    const T = D.TYPES[inc.type];
    return `<div class="pop"><h4><span class="swatch" style="background:${T.color}"></span>${esc(T.label)}</h4>
      <div class="muted mono" style="font-size:11px">${inc.id}</div>
      <div class="kv"><span>Lugar</span><span>${esc(inc.addr)}</span><span>Zona</span><span>${esc(D.ZONES[inc.zone].name)}</span>
      <span>Fecha</span><span>${fmt.dateTime(inc.t)}</span><span>Fuente</span><span>${esc(inc.source)}</span>
      <span>Estado</span><span>${MT.statusTag(inc.status)}</span></div>
      <p class="muted">${esc(inc.desc || '')}</p></div>`;
  };

  /* ---------- Mapa operativo ---------- */
  const M = MT.Map = {
    map: null,
    layers: {},
    filter: { period: 'mes', types: new Set(Object.keys(D.TYPES)), franja: 'all', zone: 'all', from: null, to: null },
    visible: { units: true, incidents: true, heat: true, cameras: true, coverage: false, alerts: true, pois: false, routes: false }
  };

  M.init = function () {
    const map = M.map = MT.makeMap('map-op', { zoom: 15 });
    map.zoomControl.setPosition('bottomleft');
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const L_ = M.layers;
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
    L_.units = L.layerGroup();
    L_.cameras = L.layerGroup();
    L_.coverage = L.layerGroup();
    L_.alerts = L.layerGroup();
    L_.cases = L.layerGroup().addTo(map); // SOS y despachos: siempre visibles
    L_.pois = L.layerGroup();
    L_.routes = L.layerGroup();

    D.POIS.forEach(p => {
      const letter = { salud: 'H', seguridad: 'C', gobierno: 'M', educacion: 'E', transporte: 'T' }[p.kind];
      L.marker(p.pos, { icon: L.divIcon({ className: '', html: `<div class="poi-marker">${letter}</div>`, iconSize: [22, 22] }) })
        .bindTooltip(p.name, { direction: 'top', offset: [0, -10] }).addTo(L_.pois);
    });

    buildPanels();
    Object.keys(M.visible).forEach(k => { if (M.visible[k]) map.addLayer(L_[k]); });
    M.render();

    // Menú contextual: clic derecho en el mapa
    map.on('contextmenu', e => {
      const ll = [e.latlng.lat, e.latlng.lng];
      const el = MT.h(`<div class="pop"><h4>${icon('pin', 15)} ${esc(D.address(ll[0], ll[1]))}</h4>
        <div class="acts" style="flex-direction:column;align-items:stretch">
          <button class="btn btn-sm btn-danger" data-a="sos">${icon('radio', 14)} Simular SOS aquí</button>
          <button class="btn btn-sm btn-warn" data-a="vecino">${icon('phone', 14)} Reporte de vecino aquí</button>
          <button class="btn btn-sm" data-a="inc">${icon('plus', 14)} Cargar incidente aquí</button>
        </div></div>`);
      const pop = L.popup().setLatLng(e.latlng).setContent(el).openOn(map);
      el.querySelector('[data-a=sos]').onclick = () => { map.closePopup(pop); MT.SOS.openSimulator('sos', ll); };
      el.querySelector('[data-a=vecino]').onclick = () => { map.closePopup(pop); MT.SOS.openSimulator('vecino', ll); };
      el.querySelector('[data-a=inc]').onclick = () => { map.closePopup(pop); M.openIncidentForm(ll); };
    });

    document.addEventListener('mt:incidents', () => M.render());
  };

  M.setLayer = function (key, on) {
    M.visible[key] = on;
    on ? M.map.addLayer(M.layers[key]) : M.map.removeLayer(M.layers[key]);
    if (key === 'routes' && on) M.drawRoutes();
  };

  M.drawRoutes = function () {
    const g = M.layers.routes;
    g.clearLayers();
    MT.Routes.all().forEach(r => {
      L.polyline(r.path || r.points, { color: r.color, weight: 4, opacity: .75, dashArray: '2 8', lineCap: 'round' })
        .bindTooltip(`Ruta: ${esc(r.name)} · ${fmt.hourRange(r.start, r.end)}`, { sticky: true }).addTo(g);
    });
  };

  /* ---------- Render de incidentes según filtros ---------- */
  M.render = function () {
    if (!M.map) return;
    const list = D.filter(M.filter);
    const L_ = M.layers;
    L_.incidents.clearLayers();
    L_.incidents.addLayers(list.map(inc => L.marker([inc.lat, inc.lng], { icon: MT.incidentIcon(inc) }).bindPopup(() => MT.incidentPopup(inc))));
    // El mapa de calor solo se redibuja con el mapa visible (si no, el canvas mide 0)
    if (M.map.getSize().x > 0 && $('#sec-mapa').offsetParent !== null) {
      L_.heat.setOptions({ max: Math.max(1.5, Math.min(6, list.length / 60)) });
      L_.heat.setLatLngs(list.map(i => [i.lat, i.lng, 0.6]));
    }
    updateSummary(list);
  };

  function updateSummary(list) {
    const el = $('#lp-summary');
    if (!el) return;
    const f = M.filter;
    const [a, b] = D.periodRange(f.period, f.from, f.to);
    const prev = D.filter(Object.assign({}, f, { period: 'custom', from: a - (b - a), to: a }));
    const delta = prev.length ? (list.length - prev.length) / prev.length : 0;
    const zones = {};
    list.forEach(i => { zones[i.zone] = (zones[i.zone] || 0) + 1; });
    const topZone = Object.entries(zones).sort((x, y) => y[1] - x[1])[0];
    const peak = D.peakWindow(list, 3);
    el.innerHTML = `<div class="mini-stats">
      <div class="mini-stat"><b>${list.length}</b><span>Incidentes</span></div>
      <div class="mini-stat"><b class="${delta > 0 ? 'delta-up' : 'delta-down'}">${prev.length ? (delta > 0 ? '▲ ' : '▼ ') + fmt.pct(Math.abs(delta)) : '—'}</b><span>vs. período anterior</span></div>
      <div class="mini-stat" style="grid-column:span 2"><b style="font-size:14px;font-family:var(--font)">${topZone ? esc(D.ZONES[topZone[0]].name) : '—'}</b><span>Zona más afectada ${topZone ? `(${topZone[1]} casos, ${fmt.pct(topZone[1] / list.length)})` : ''}</span></div>
      <div class="mini-stat" style="grid-column:span 2"><b style="font-size:14px;font-family:var(--font)">${list.length ? fmt.hourRange(peak.start, peak.end) : '—'}</b><span>Franja horaria con más casos ${list.length ? `(${fmt.pct(peak.share)})` : ''}</span></div>
    </div>`;
    const c = $('#lc-incidents'); if (c) c.textContent = list.length;
  }

  /* ---------- Paneles laterales ---------- */
  function buildPanels() {
    const sec = $('#sec-mapa');
    const T = D.TYPES;
    const left = MT.h(`<aside class="map-panel left" id="panel-left">
      <div class="panel-tabs"><button class="active" style="justify-content:flex-start;padding-left:8px">${icon('layers', 15)} Capas y filtros</button>
        <button class="icon-btn" data-close style="flex:0 0 34px" aria-label="Ocultar panel">${icon('x', 15)}</button></div>
      <div class="panel-scroll">
        <div class="panel-sec"><h4>Mapa base</h4>
          <div class="seg" id="base-seg"><button data-v="dark" class="active">Oscuro</button><button data-v="calles">Calles</button><button data-v="satelite">Satélite</button></div></div>
        <div class="panel-sec"><h4>Período</h4>
          <div class="seg" id="period-seg" style="display:flex">
            <button data-v="hoy">Hoy</button><button data-v="semana">Semana</button><button data-v="mes" class="active">Mes</button><button data-v="anio">Año</button><button data-v="custom">Rango</button></div>
          <div class="row hidden" id="custom-range" style="margin-top:8px"><input type="date" class="input" id="f-from"><input type="date" class="input" id="f-to"></div>
        </div>
        <div class="panel-sec"><h4>Resumen del filtro</h4><div id="lp-summary"></div></div>
        <div class="panel-sec"><h4>Capas</h4>
          ${[['units', 'Patrullas en vivo', 'car'], ['incidents', 'Incidentes', 'pin'], ['heat', 'Mapa de calor', 'target'], ['cameras', 'Cámaras', 'video'], ['coverage', 'Cobertura de cámaras', 'eye'], ['alerts', 'Alertas IA', 'cpu'], ['routes', 'Rutas de patrullaje', 'route'], ['pois', 'Puntos de interés (aprox.)', 'flag']]
            .map(([k, l, i]) => `<label class="check layer-row"><span class="row" style="gap:9px"><input type="checkbox" data-layer="${k}" ${M.visible[k] ? 'checked' : ''}>${icon(i, 15, 'dim')}${l}</span><span class="count" id="lc-${k}"></span></label>`).join('')}
        </div>
        <div class="panel-sec"><h4>Tipo de incidente <button class="btn btn-ghost btn-xs" id="types-all">Todos</button></h4>
          ${Object.entries(T).map(([k, t]) => `<label class="check"><input type="checkbox" data-type="${k}" checked><span class="swatch" style="background:${t.color}"></span>${t.label}</label>`).join('')}
        </div>
        <div class="panel-sec stack"><h4>Más filtros</h4>
          <label class="field">Franja horaria<select class="select" id="f-franja"><option value="all">Todo el día</option><option value="manana">Mañana (06–12)</option><option value="tarde">Tarde (12–20)</option><option value="noche">Noche (20–01)</option><option value="madrugada">Madrugada (01–06)</option></select></label>
          <label class="field">Zona<select class="select" id="f-zone"><option value="all">Todas las zonas</option>${Object.entries(D.ZONES).map(([k, z]) => `<option value="${k}">${z.name}</option>`).join('')}</select></label>
        </div>
      </div></aside>`);
    const right = MT.h(`<aside class="map-panel right" id="panel-right">
      <div class="panel-tabs" id="rp-tabs">
        <button data-tab="casos" class="active">${icon('radio', 14)} Casos <span class="pill hidden" id="pill-casos"></span></button>
        <button data-tab="alertas">${icon('cpu', 14)} Alertas IA <span class="pill hidden" id="pill-alertas"></span></button>
        <button data-tab="moviles">${icon('car', 14)} Móviles</button>
        <button class="icon-btn" data-close style="flex:0 0 34px" aria-label="Ocultar panel">${icon('x', 15)}</button>
      </div>
      <div class="panel-scroll" id="rp-casos"></div>
      <div class="panel-scroll hidden" id="rp-alertas"></div>
      <div class="panel-scroll hidden" id="rp-moviles"></div>
    </aside>`);
    const tgL = MT.h(`<div class="panel-toggle left hidden"><button class="btn btn-sm">${icon('layers', 15)} Capas y filtros</button></div>`);
    const tgR = MT.h(`<div class="panel-toggle right hidden"><button class="btn btn-sm">${icon('radio', 15)} Casos y alertas</button></div>`);
    sec.append(left, right, tgL, tgR);

    const togglePanel = (panel, tg, show) => {
      panel.classList.toggle('collapsed', !show);
      tg.classList.toggle('hidden', show);
      sec.classList.toggle(panel === left ? 'lp-open' : 'rp-open', show);
    };
    sec.classList.add('lp-open', 'rp-open');
    left.querySelector('[data-close]').onclick = () => togglePanel(left, tgL, false);
    right.querySelector('[data-close]').onclick = () => togglePanel(right, tgR, false);
    tgL.querySelector('button').onclick = () => togglePanel(left, tgL, true);
    tgR.querySelector('button').onclick = () => togglePanel(right, tgR, true);
    // En pantallas chicas los paneles arrancan cerrados
    if (window.innerWidth < 860) { togglePanel(left, tgL, false); togglePanel(right, tgR, false); }
    M.showRightTab = tab => {
      togglePanel(right, tgR, true);
      $$('#rp-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      ['casos', 'alertas', 'moviles'].forEach(t => $('#rp-' + t).classList.toggle('hidden', t !== tab));
      if (window.innerWidth < 860) togglePanel(left, tgL, false);
    };
    $$('#rp-tabs [data-tab]').forEach(b => b.onclick = () => M.showRightTab(b.dataset.tab));

    $$('#base-seg button').forEach(b => b.onclick = () => {
      $$('#base-seg button').forEach(x => x.classList.toggle('active', x === b));
      M.map.setBase(b.dataset.v);
    });
    $$('#period-seg button').forEach(b => b.onclick = () => {
      $$('#period-seg button').forEach(x => x.classList.toggle('active', x === b));
      M.filter.period = b.dataset.v;
      $('#custom-range').classList.toggle('hidden', b.dataset.v !== 'custom');
      if (b.dataset.v === 'custom') {
        const today = new Date();
        const iso = d => d.toISOString().slice(0, 10);
        if (!$('#f-from').value) $('#f-from').value = iso(new Date(today - 60 * 86400000));
        if (!$('#f-to').value) $('#f-to').value = iso(today);
        readRange();
      }
      M.render();
    });
    const readRange = () => {
      const f = $('#f-from').value, t = $('#f-to').value;
      M.filter.from = f ? new Date(f + 'T00:00').getTime() : null;
      M.filter.to = t ? new Date(t + 'T23:59').getTime() : null;
    };
    ['#f-from', '#f-to'].forEach(s => $(s).onchange = () => { readRange(); M.render(); });
    $$('[data-layer]', left).forEach(cb => cb.onchange = () => M.setLayer(cb.dataset.layer, cb.checked));
    $$('[data-type]', left).forEach(cb => cb.onchange = () => {
      cb.checked ? M.filter.types.add(cb.dataset.type) : M.filter.types.delete(cb.dataset.type);
      M.render();
    });
    $('#types-all').onclick = () => {
      const all = M.filter.types.size < Object.keys(T).length;
      $$('[data-type]', left).forEach(cb => { cb.checked = all; all ? M.filter.types.add(cb.dataset.type) : M.filter.types.delete(cb.dataset.type); });
      M.render();
    };
    $('#f-franja').onchange = e => { M.filter.franja = e.target.value; M.render(); };
    $('#f-zone').onchange = e => { M.filter.zone = e.target.value; M.render(); };
  }

  /* ---------- Elegir un punto en el mapa ---------- */
  M.pickPoint = function (message, cls = '') {
    return new Promise(resolve => {
      MT.App.go('mapa');
      const hint = MT.h(`<div class="map-hint ${cls}">${icon('crosshair', 16)} ${esc(message)} <button class="btn btn-xs" style="background:rgba(0,0,0,.25);border-color:transparent;color:#fff">Cancelar</button></div>`);
      $('#sec-mapa').appendChild(hint);
      document.body.classList.add('picking');
      const done = val => {
        hint.remove(); document.body.classList.remove('picking');
        M.map.off('click', onClick); document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onClick = e => done([e.latlng.lat, e.latlng.lng]);
      const onKey = e => { if (e.key === 'Escape') done(null); };
      hint.querySelector('button').onclick = () => done(null);
      setTimeout(() => M.map.on('click', onClick), 50);
      document.addEventListener('keydown', onKey);
    });
  };

  M.focus = function (ll, zoom = 17) {
    MT.App.go('mapa');
    setTimeout(() => M.map.flyTo(ll, zoom, { duration: .8 }), 60);
  };

  M.showIncident = function (inc) {
    MT.App.go('mapa');
    setTimeout(() => {
      M.map.flyTo([inc.lat, inc.lng], 18, { duration: .8 });
      setTimeout(() => L.popup().setLatLng([inc.lat, inc.lng]).setContent(MT.incidentPopup(inc)).openOn(M.map), 900);
    }, 60);
  };

  /* ---------- Cargar incidente manualmente ---------- */
  M.openIncidentForm = async function (ll, preset = {}) {
    if (!ll) {
      ll = await M.pickPoint('Hacé clic en el mapa donde ocurrió el incidente', 'info');
      if (!ll) return;
    }
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const m = MT.modal({
      title: `${icon('plus', 18)} Cargar incidente`,
      body: `<form class="stack" id="inc-form">
        <div class="note note-info">${icon('pin', 15)} <span>${esc(D.address(ll[0], ll[1]))} · ${esc(D.ZONES[D.zoneOf(ll[0], ll[1])].name)}</span></div>
        <label class="field">Tipo<select class="select" name="type">${Object.entries(D.TYPES).map(([k, t]) => `<option value="${k}" ${preset.type === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <div class="row"><label class="field grow">Fecha y hora<input class="input" type="datetime-local" name="t" value="${now}"></label>
        <label class="field grow">Fuente<select class="select" name="source">${D.SOURCES.map(s => `<option ${preset.source === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
        <label class="field">Descripción<textarea class="input" name="desc" placeholder="Qué pasó, faltantes, características de los autores…">${esc(preset.desc || '')}</textarea></label>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary">Guardar incidente</button></div>
      </form>`
    });
    const form = m.body.querySelector('form');
    form.querySelector('[data-cancel]').onclick = m.close;
    form.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(form);
      const inc = D.addIncident({ type: fd.get('type'), lat: ll[0], lng: ll[1], t: new Date(fd.get('t')).getTime() || Date.now(), source: fd.get('source'), desc: fd.get('desc') || 'Incidente cargado por operador.', status: 'abierto', respMin: preset.respMin });
      m.close();
      MT.toast({ title: 'Incidente registrado', msg: `${inc.id} · ${esc(inc.addr)}`, level: 'ok' });
      MT.beep('ok');
    };
  };
})(window.MT);
