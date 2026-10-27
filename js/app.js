/* Arranque de la aplicación: sesión, navegación, reloj, insignias y barra de herramientas del mapa. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  // Sesión (si el navegador no permite guardar datos, entra como administrador para no trabar la demo)
  let storageOk = true;
  try { localStorage.setItem('mt_test', '1'); localStorage.removeItem('mt_test'); } catch (e) { storageOk = false; }
  let session = MT.Store.get('session');
  if (!session) {
    if (storageOk) { location.replace('index.html'); return; }
    session = { name: D.USERS[0].name, role: 'admin', email: D.USERS[0].email };
  }

  const NAV = [
    { group: 'Operación' },
    { id: 'mapa', label: 'Mapa operativo', icon: 'map' },
    { id: 'camaras', label: 'Cámaras', icon: 'video', roles: ['admin', 'operador'] },
    { id: 'alertas', label: 'Alertas y casos', icon: 'bell', count: true },
    { id: 'flota', label: 'Flota y patrullas', icon: 'car' },
    { group: 'Gestión' },
    { id: 'incidentes', label: 'Incidentes', icon: 'list', roles: ['admin', 'operador'] },
    { id: 'rutas', label: 'Rutas de patrullaje', icon: 'route', roles: ['admin', 'operador'] },
    { id: 'estadisticas', label: 'Estadísticas', icon: 'chart', roles: ['admin', 'operador'] },
    { id: 'analisis', label: 'Análisis y planificación', icon: 'target', roles: ['admin'] },
    { group: 'Proyecto' },
    { id: 'hoja', label: 'Hoja de ruta', icon: 'flag', roles: ['admin'] }
  ];
  const TITLES = Object.fromEntries(NAV.filter(n => n.id).map(n => [n.id, n.label]));
  const allowed = n => !n.roles || n.roles.includes(session.role);

  const App = MT.App = { current: null };

  App.go = function (id) {
    const item = NAV.find(n => n.id === id);
    if (!item || !allowed(item)) id = 'mapa';
    if (App.current === id) return;
    App.current = id;
    $$('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-' + id));
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === id));
    document.body.classList.toggle('on-map', id === 'mapa');
    $('#page-title').textContent = TITLES[id];
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    closeMenu();
    ({
      mapa: () => setTimeout(() => { MT.Map.map.invalidateSize(); MT.Map.render(); }, 30),
      camaras: () => MT.Cameras.renderGrid(),
      alertas: () => MT.Alerts.renderSection(),
      incidentes: () => MT.Sections.incidents(),
      rutas: () => MT.Routes.render(),
      estadisticas: () => MT.Stats.render(),
      analisis: () => MT.Analysis.render(),
      flota: () => MT.Sections.fleet(),
      hoja: () => MT.Sections.roadmap()
    })[id]();
  };

  App.updateBadges = function () {
    const n = MT.Alerts.active().length + MT.SOS.active().length;
    const c = $('#nav-count-alertas');
    c.textContent = n; c.classList.toggle('hidden', !n);
    const b = $('#bell-badge');
    b.textContent = n; b.classList.toggle('hidden', !n);
  };

  function closeMenu() { $('.sidebar').classList.remove('open'); $('.backdrop').classList.remove('show'); }

  function buildShell() {
    // Oculta los grupos que quedan vacíos para el rol actual
    const items = NAV.filter(n => n.group || allowed(n));
    const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
    $('#nav').innerHTML = visible.map(n => n.group
      ? `<div class="nav-label">${n.group}</div>`
      : `<a href="#${n.id}" data-sec="${n.id}">${icon(n.icon, 18)}<span>${n.label}</span>${n.count ? `<span class="count hidden" id="nav-count-${n.id}"></span>` : ''}</a>`).join('');
    $$('.nav a').forEach(a => a.onclick = e => { e.preventDefault(); App.go(a.dataset.sec); });

    const initials = session.name.split(/[\s–-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    $('#user-chip').innerHTML = `<div class="avatar">${esc(initials)}</div><div class="who"><strong>${esc(session.name)}</strong><span>${D.ROLE_LABEL[session.role]}</span></div>`;
    $('#menu-btn').innerHTML = icon('menu', 20);
    $('#bell').insertAdjacentHTML('afterbegin', icon('bell', 19));
    $('#bell').onclick = () => App.go('alertas');
    const setMute = () => { $('#mute').innerHTML = icon(MT.isMuted() ? 'mute' : 'volume', 18); $('#mute').title = MT.isMuted() ? 'Activar sonido' : 'Silenciar alertas'; };
    setMute();
    $('#mute').onclick = () => { MT.Store.set('muted', !MT.isMuted()); setMute(); };
    $('#logout').innerHTML = icon('logout', 18);
    $('#logout').onclick = () => { MT.Store.del('session'); location.href = 'index.html'; };
    $('#menu-btn').onclick = () => { $('.sidebar').classList.add('open'); $('.backdrop').classList.add('show'); };
    $('.backdrop').onclick = closeMenu;

    // Barra del mapa
    $('#tb-sos').innerHTML = `${icon('radio', 15)}<span>SOS<span class="lbl-long"> ciudadano</span></span>`;
    $('#tb-vecino').innerHTML = `${icon('phone', 15)}<span><span class="lbl-long">Reporte de </span>vecino</span>`;
    $('#tb-ia').innerHTML = `${icon('cpu', 15)}<span><span class="lbl-long">Simular </span>alerta IA</span>`;
    $('#tb-inc').innerHTML = `${icon('plus', 15)}<span><span class="lbl-long">Cargar </span>incidente</span>`;
    $('#tb-sos').onclick = () => MT.SOS.openSimulator('sos');
    $('#tb-vecino').onclick = () => MT.SOS.openSimulator('vecino');
    $('#tb-ia').onclick = () => { if (!MT.Alerts.generate()) MT.toast({ title: 'No hay cámaras libres', msg: 'Todas las cámaras en línea tienen una alerta abierta.', level: 'warn' }); };
    $('#tb-inc').onclick = () => MT.Map.openIncidentForm(null);
    $('#sim-chip').innerHTML = `<i class="dot dot-live"></i> Simulación en vivo · movimiento acelerado ×${MT.SIM} · datos ficticios`;

    const tick = () => {
      const d = new Date();
      $('#clock').innerHTML = `${icon('clock', 14)}<span class="date">${fmt.date(d)}&nbsp;</span>${fmt.time(d, true)}`;
    };
    tick(); setInterval(tick, 1000);
  }

  function sysStatus() {
    const routing = MT.Routing.online === true ? ['ok', 'Ruteo por calles: en línea'] : MT.Routing.online === false ? ['warn', 'Ruteo: modo aproximado'] : ['', 'Ruteo: verificando…'];
    const col = { ok: 'var(--ok)', warn: 'var(--warn)', '': 'var(--dim)' };
    $('#sys-status').innerHTML = `
      <div><i class="dot dot-live"></i> Sistema operativo</div>
      <div><i class="dot" style="background:${col[routing[0]]}"></i> ${routing[1]}</div>
      <div><i class="dot" style="background:var(--warn)"></i> Datos de demostración</div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildShell();
    $('#sec-mapa').classList.add('active'); // el mapa necesita estar visible para medir su tamaño al iniciar
    MT.Map.init();
    MT.Patrols.init(MT.Map.map);
    MT.Cameras.init();
    MT.Alerts.init();
    MT.SOS.init();
    App.updateBadges();
    MT.Routing.get([D.inter(19, 8), D.inter(23, 8)]).then(sysStatus); // comprueba el servicio de ruteo
    sysStatus(); setInterval(sysStatus, 5000);
    App.go((location.hash || '#mapa').slice(1));
    window.addEventListener('hashchange', () => App.go(location.hash.slice(1)));
    if (!MT.Store.get('welcomed')) {
      MT.Store.set('welcomed', true);
      setTimeout(() => MT.toast({ title: `Bienvenido/a, ${session.name}`, msg: 'Probá el botón <b>SOS</b> arriba del mapa o hacé clic derecho en cualquier calle. Las alertas IA llegan solas cada tanto.', level: 'info', timeout: 12000 }), 900);
    }
  });
})(window.MT);
