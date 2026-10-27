/* Mapa en vivo: lo que pasa hoy (móviles, cámaras, incidentes del día, alertas y SOS). El historial va en history.js. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  /* ---------- Fábrica de mapas (se reutiliza en Histórico, Rutas y Análisis) ---------- */
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

  // Panel lateral plegable sobre un mapa (corre los controles de Leaflet cuando está abierto)
  MT.setupPanel = function (sec, panel, toggle, side) {
    const show = on => {
      panel.classList.toggle('collapsed', !on);
      toggle.classList.toggle('hidden', on);
      sec.classList.toggle(side === 'left' ? 'lp-open' : 'rp-open', on);
    };
    panel.querySelector('[data-close]').onclick = () => show(false);
    toggle.querySelector('button').onclick = () => show(true);
    show(window.innerWidth >= 860); // en pantallas chicas arranca cerrado
    return show;
  };

  MT.incidentIcon = function (inc) {
    const recent = Date.now() - inc.t < 2 * 3600000;
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

  /* ---------- Mapa en vivo ---------- */
  const M = MT.Map = {
    map: null,
    layers: {},
    markers: {},
    visible: { units: true, incidents: true, cameras: true, alerts: true, coverage: false, routes: false, pois: false }
  };
  const today = () => D.filter({ period: 'hoy' }).sort((a, b) => b.t - a.t);

  M.init = function () {
    const map = M.map = MT.makeMap('map-op', { zoom: 15 });
    map.zoomControl.setPosition('bottomleft');
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const L_ = M.layers;
    L_.incidents = L.layerGroup();
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
    document.addEventListener('mt:tick', M.updateLive);
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

  /* ---------- Incidentes del día ---------- */
  M.render = function () {
    if (!M.map) return;
    const list = today();
    M.layers.incidents.clearLayers();
    M.markers = {};
    list.forEach(inc => {
      M.markers[inc.id] = L.marker([inc.lat, inc.lng], { icon: MT.incidentIcon(inc), zIndexOffset: 300 })
        .bindPopup(() => MT.incidentPopup(inc)).addTo(M.layers.incidents);
    });
    const c = $('#lc-incidents'); if (c) c.textContent = list.length;
    const el = $('#lp-today');
    if (el) {
      el.innerHTML = list.length ? list.map(i => `<div class="feed-item" data-inc="${i.id}" style="cursor:pointer;border-left-color:${D.TYPES[i.type].color}">
          <div class="ttl"><span>${D.TYPES[i.type].short}</span>${MT.statusTag(i.status)}</div>
          <div class="meta"><span class="mono">${fmt.time(i.t)}</span><span>${esc(i.addr)}</span></div></div>`).join('')
        : '<div class="empty">Sin incidentes reportados hoy.</div>';
      $$('[data-inc]', el).forEach(r => r.onclick = () => {
        const inc = list.find(i => i.id === r.dataset.inc);
        M.map.flyTo([inc.lat, inc.lng], 17, { duration: .6 });
        setTimeout(() => M.markers[inc.id] && M.markers[inc.id].openPopup(), 700);
      });
    }
    M.updateLive();
  };

  M.updateLive = function () {
    const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
    const P = MT.Patrols, C = MT.Cameras;
    set('lv-inc', today().length);
    if (MT.SOS && MT.SOS.list) set('lv-cases', MT.SOS.active().length);
    if (P && P.units.length) set('lv-units', `${P.available().length}/${P.units.length}`);
    if (C) set('lv-cams', `${C.cams.filter(c => c.status === 'online').length}/${C.cams.length}`);
    if (MT.Alerts && MT.Alerts.list) set('lv-alerts', MT.Alerts.active().length);
  };

  /* ---------- Paneles laterales ---------- */
  function buildPanels() {
    const sec = $('#sec-mapa');
    const left = MT.h(`<aside class="map-panel left" id="panel-left">
      <div class="panel-tabs"><button class="active" style="justify-content:flex-start;padding-left:8px"><i class="dot dot-live"></i>&nbsp;En vivo · hoy</button>
        <button class="icon-btn" data-close style="flex:0 0 34px" aria-label="Ocultar panel">${icon('x', 15)}</button></div>
      <div class="panel-scroll">
        <div class="panel-sec"><h4>Situación ahora</h4>
          <div class="mini-stats">
            <div class="mini-stat"><b id="lv-inc">0</b><span>Incidentes hoy</span></div>
            <div class="mini-stat"><b id="lv-cases">0</b><span>SOS / casos en curso</span></div>
            <div class="mini-stat"><b id="lv-units">—</b><span>Móviles disponibles</span></div>
            <div class="mini-stat"><b id="lv-cams">—</b><span>Cámaras en línea</span></div>
            <div class="mini-stat" style="grid-column:span 2"><b id="lv-alerts">0</b><span>Alertas IA sin atender</span></div>
          </div></div>
        <div class="panel-sec"><h4>Incidentes de hoy</h4><div class="feed" id="lp-today"></div></div>
        <div class="panel-sec"><h4>Capas</h4>
          ${[['units', 'Móviles en vivo', 'car'], ['incidents', 'Incidentes de hoy', 'pin'], ['cameras', 'Cámaras', 'video'], ['alerts', 'Alertas IA', 'cpu'], ['coverage', 'Cobertura de cámaras', 'eye'], ['routes', 'Rutas de patrullaje', 'route'], ['pois', 'Puntos de interés (aprox.)', 'flag']]
            .map(([k, l, i]) => `<label class="check layer-row"><span class="row" style="gap:9px"><input type="checkbox" data-layer="${k}" ${M.visible[k] ? 'checked' : ''}>${icon(i, 15, 'dim')}${l}</span><span class="count" id="lc-${k}"></span></label>`).join('')}
        </div>
        <div class="panel-sec"><h4>Mapa base</h4>
          <div class="seg" id="base-seg"><button data-v="dark" class="active">Oscuro</button><button data-v="calles">Calles</button><button data-v="satelite">Satélite</button></div></div>
        <div class="panel-sec"><button class="btn btn-sm btn-block" id="go-history">${icon('layers', 14)} Ver el historial en el Mapa histórico</button></div>
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
    const tgL = MT.h(`<div class="panel-toggle left hidden"><button class="btn btn-sm"><i class="dot dot-live"></i> En vivo · capas</button></div>`);
    const tgR = MT.h(`<div class="panel-toggle right hidden"><button class="btn btn-sm">${icon('radio', 15)} Casos y alertas</button></div>`);
    sec.append(left, right, tgL, tgR);

    const showLeft = MT.setupPanel(sec, left, tgL, 'left');
    const showRight = MT.setupPanel(sec, right, tgR, 'right');
    M.showRightTab = tab => {
      showRight(true);
      $$('#rp-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      ['casos', 'alertas', 'moviles'].forEach(t => $('#rp-' + t).classList.toggle('hidden', t !== tab));
      if (window.innerWidth < 860) showLeft(false);
    };
    $$('#rp-tabs [data-tab]').forEach(b => b.onclick = () => M.showRightTab(b.dataset.tab));

    $$('#base-seg button').forEach(b => b.onclick = () => {
      $$('#base-seg button').forEach(x => x.classList.toggle('active', x === b));
      M.map.setBase(b.dataset.v);
    });
    $$('[data-layer]', left).forEach(cb => cb.onchange = () => M.setLayer(cb.dataset.layer, cb.checked));
    $('#go-history').onclick = () => MT.App.go('historico');
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

  // Los incidentes de hoy se muestran en el mapa en vivo; los anteriores, en el histórico
  M.showIncident = function (inc) {
    if (!M.markers[inc.id]) return MT.History.showIncident(inc);
    MT.App.go('mapa');
    setTimeout(() => {
      M.map.flyTo([inc.lat, inc.lng], 18, { duration: .8 });
      setTimeout(() => M.markers[inc.id] && M.markers[inc.id].openPopup(), 900);
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
