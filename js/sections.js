/* Secciones de listado: incidentes, flota y hoja de ruta del proyecto. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;
  const Sx = MT.Sections = {};

  /* =================== Incidentes =================== */
  const st = { q: '', type: 'all', status: 'all', period: 'anio', sort: 't', dir: -1, page: 0 };
  const PAGE = 25;
  let incBuilt = false;

  Sx.incidents = function () {
    const sec = $('#sec-incidentes');
    if (!incBuilt) {
      incBuilt = true;
      sec.innerHTML = `<div class="page">
        <div class="page-head"><div><h2>Registro de incidentes</h2><p>Historial completo con búsqueda y filtros. Cada incidente cargado aparece al instante en el mapa y en las estadísticas.</p></div>
          <div class="toolbar"><button class="btn btn-sm" id="in-csv">${icon('download', 14)} CSV</button><button class="btn btn-sm btn-primary" id="in-new">${icon('plus', 14)} Nuevo incidente</button></div></div>
        <div class="card">
          <div class="card-body toolbar" style="border-bottom:1px solid var(--border)">
            <div class="search-box">${icon('search', 15)}<input class="input" id="in-q" placeholder="Buscar por ID, calle, descripción…"></div>
            <select class="select" id="in-type"><option value="all">Todos los tipos</option>${Object.entries(D.TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}</select>
            <select class="select" id="in-status"><option value="all">Todos los estados</option><option value="abierto">Abierto</option><option value="investigacion">En investigación</option><option value="cerrado">Cerrado</option></select>
            <select class="select" id="in-period"><option value="semana">Última semana</option><option value="mes">Último mes</option><option value="trimestre">Últimos 90 días</option><option value="anio" selected>Último año</option></select>
            <span class="muted" id="in-count" style="margin-left:auto;font-size:12.5px"></span>
          </div>
          <div class="table-wrap"><table class="tbl"><thead><tr>
            <th class="sortable" data-sort="id">ID</th><th class="sortable" data-sort="t">Fecha ▾</th><th class="sortable" data-sort="type">Tipo</th><th>Lugar (aprox.)</th><th class="sortable" data-sort="zone">Zona</th><th>Fuente</th><th>Estado</th><th></th>
          </tr></thead><tbody id="in-body"></tbody></table></div>
          <div class="pager"><span id="in-pageinfo"></span><div class="row"><button class="btn btn-sm" id="in-prev">Anterior</button><button class="btn btn-sm" id="in-next">Siguiente</button></div></div>
        </div></div>`;
      let tmr;
      $('#in-q').oninput = e => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value.trim().toLowerCase(); st.page = 0; drawTable(); }, 150); };
      [['#in-type', 'type'], ['#in-status', 'status'], ['#in-period', 'period']].forEach(([s, k]) => $(s).onchange = e => { st[k] = e.target.value; st.page = 0; drawTable(); });
      $$('th[data-sort]', sec).forEach(th => th.onclick = () => {
        st.dir = st.sort === th.dataset.sort ? -st.dir : (th.dataset.sort === 't' ? -1 : 1);
        st.sort = th.dataset.sort; drawTable();
      });
      $('#in-prev').onclick = () => { st.page = Math.max(0, st.page - 1); drawTable(); };
      $('#in-next').onclick = () => { st.page++; drawTable(); };
      $('#in-new').onclick = () => MT.Map.openIncidentForm(null);
      $('#in-csv').onclick = () => MT.Stats.exportCSV(filtered(), 'registro_incidentes');
      document.addEventListener('mt:incidents', () => { if ($('#sec-incidentes.active')) drawTable(); });
    }
    drawTable();
  };

  function filtered() {
    return D.filter({ period: st.period }).filter(i =>
      (st.type === 'all' || i.type === st.type) &&
      (st.status === 'all' || i.status === st.status) &&
      (!st.q || `${i.id} ${i.addr} ${i.desc} ${D.ZONES[i.zone].name}`.toLowerCase().includes(st.q))
    ).sort((a, b) => (a[st.sort] > b[st.sort] ? 1 : a[st.sort] < b[st.sort] ? -1 : 0) * st.dir);
  }

  function drawTable() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    st.page = Math.min(st.page, pages - 1);
    const rows = list.slice(st.page * PAGE, st.page * PAGE + PAGE);
    $('#in-count').textContent = `${fmt.num(list.length)} resultados`;
    $('#in-pageinfo').textContent = `Página ${st.page + 1} de ${pages}`;
    $('#in-prev').disabled = st.page === 0;
    $('#in-next').disabled = st.page >= pages - 1;
    $$('#sec-incidentes th[data-sort]').forEach(th => { th.textContent = th.textContent.replace(/ [▾▴]$/, '') + (th.dataset.sort === st.sort ? (st.dir < 0 ? ' ▾' : ' ▴') : ''); });
    $('#in-body').innerHTML = rows.map(i => `<tr data-id="${i.id}">
      <td class="mono">${i.id}</td><td class="mono" style="white-space:nowrap">${fmt.dateTime(i.t)}</td>
      <td><span class="row" style="gap:7px"><span class="swatch" style="background:${D.TYPES[i.type].color}"></span>${D.TYPES[i.type].short}</span></td>
      <td>${esc(i.addr)}</td><td>${esc(D.ZONES[i.zone].name)}</td><td>${esc(i.source)}</td>
      <td><select class="select" data-status="${i.id}">${[['abierto', 'Abierto'], ['investigacion', 'En investigación'], ['cerrado', 'Cerrado']].map(([v, l]) => `<option value="${v}" ${i.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><button class="btn btn-xs" data-map="${i.id}">${icon('pin', 12)} Mapa</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">No hay incidentes con esos filtros.</td></tr>`;
    const byId = id => D.incidents().find(i => i.id === id);
    $$('#in-body tr[data-id]').forEach(tr => tr.onclick = e => { if (e.target.closest('select,button')) return; detail(byId(tr.dataset.id)); });
    $$('#in-body [data-status]').forEach(s => s.onchange = () => { D.setStatus(s.dataset.status, s.value); MT.toast({ title: 'Estado actualizado', msg: `${s.dataset.status} → ${s.options[s.selectedIndex].text}`, level: 'ok', timeout: 3000 }); });
    $$('#in-body [data-map]').forEach(b => b.onclick = () => MT.Map.showIncident(byId(b.dataset.map)));
  }

  function detail(inc) {
    const near = MT.Cameras.cams.filter(c => MT.Geo.dist(c.pos, [inc.lat, inc.lng]) <= 200);
    const m = MT.modal({
      title: `${inc.id} · ${esc(D.TYPES[inc.type].label)}`,
      body: `<div class="pop stack"><div class="kv" style="margin:0">
        <span>Fecha y hora</span><span>${fmt.dateTime(inc.t)}</span><span>Lugar</span><span>${esc(inc.addr)} (aprox.)</span>
        <span>Zona</span><span>${esc(D.ZONES[inc.zone].name)}</span><span>Fuente</span><span>${esc(inc.source)}</span>
        <span>Estado</span><span>${MT.statusTag(inc.status)}</span>${inc.respMin ? `<span>Tiempo de respuesta</span><span>${inc.respMin} min</span>` : ''}
        <span>Cámaras a ≤200 m</span><span>${near.length ? near.map(c => `<a href="#" data-cam="${c.id}">${c.id}</a>`).join(', ') : 'Ninguna'}</span></div>
        <p>${esc(inc.desc)}</p>
        <div class="modal-foot"><button class="btn" data-map>${icon('pin', 14)} Ver en mapa</button></div></div>`
    });
    m.body.querySelector('[data-map]').onclick = () => { m.close(); MT.Map.showIncident(inc); };
    m.body.querySelectorAll('[data-cam]').forEach(a => a.onclick = e => { e.preventDefault(); MT.Cameras.open(a.dataset.cam); });
  }

  /* =================== Flota =================== */
  Sx.fleet = function () {
    const sec = $('#sec-flota');
    const P = MT.Patrols;
    const units = P.units;
    const count = m => units.filter(u => m.includes(u.mode)).length;
    sec.innerHTML = `<div class="page">
      <div class="page-head"><div><h2>Flota y patrullas</h2><p>Estado de los móviles de la Guardia Urbana y de la Policía que comparten el sistema.</p></div></div>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
        <div class="card kpi"><span class="lbl">${icon('car', 15)} Patrullando</span><span class="val">${count(['patrol', 'return'])}</span></div>
        <div class="card kpi"><span class="lbl">${icon('radio', 15)} Atendiendo casos</span><span class="val">${count(['dispatch', 'assigning', 'onscene'])}</span></div>
        <div class="card kpi"><span class="lbl">${icon('flag', 15)} En base</span><span class="val">${count(['base', 'hold'])}</span></div>
        <div class="card kpi"><span class="lbl">${icon('x', 15)} Fuera de servicio</span><span class="val">${count(['oos'])}</span></div>
      </div>
      <div class="fleet">${units.map(u => {
        const c = u.caseId && MT.SOS.get(u.caseId);
        const route = MT.Routes.all().find(r => r.unit === u.id);
        return `<div class="card unit-card">
          <div class="top"><div class="unit-badge ${u.kind}">${u.short}</div><div class="grow"><b>${esc(u.name)}</b><div class="muted" style="font-size:12px">${esc(u.org)} · ${esc(u.plate)}</div></div>${P.statusTag(u)}</div>
          <div class="kv"><span>Agentes</span><span>${u.agents.map(esc).join(', ')}</span><span>Turno</span><span>${u.shift}</span>
            <span>Velocidad</span><span class="mono">${P.speedKmh(u)} km/h</span><span>Recorrido</span><span>${route ? esc(route.name) : 'Circuito base'}</span>
            ${c ? `<span>Caso</span><span>${c.id} · ${esc(c.typeLabel)}</span>` : ''}</div>
          <div class="row row-wrap" style="gap:6px">
            <button class="btn btn-xs" data-a="loc" data-u="${u.id}">${icon('pin', 12)} Ubicar</button>
            <button class="btn btn-xs" data-a="fol" data-u="${u.id}">${icon('crosshair', 12)} Seguir</button>
            ${['base', 'oos', 'hold'].includes(u.mode) ? `<button class="btn btn-xs btn-primary" data-a="rel" data-u="${u.id}">Salir a patrullar</button>` : ''}
            ${['patrol', 'return'].includes(u.mode) ? `<button class="btn btn-xs" data-a="base" data-u="${u.id}">Enviar a base</button><button class="btn btn-xs btn-ghost" data-a="oos" data-u="${u.id}">Fuera de servicio</button>` : ''}
          </div></div>`;
      }).join('')}</div>
      <div class="note note-info">${icon('info', 15)}<span>En producción cada móvil reporta su posición con un equipo GPS o una app en el celular del agente. Esto también permite medir kilómetros recorridos y horas de patrullaje por zona.</span></div></div>`;
    $$('[data-a]', sec).forEach(b => b.onclick = () => {
      const id = b.dataset.u;
      ({ loc: () => MT.Map.focus(P.get(id).pos, 17), fol: () => P.follow(id), rel: () => P.release(id), base: () => P.sendToBase(id), oos: () => P.setOutOfService(id) })[b.dataset.a]();
    });
  };
  document.addEventListener('mt:units', () => { if ($('#sec-flota.active')) Sx.fleet(); });

  /* =================== Hoja de ruta =================== */
  Sx.roadmap = function () {
    const rows = [
      ['Mapa, registro de incidentes y estadísticas', 'ok', 'Funciona (datos ficticios)', 'Carga diaria por operadores del Centro de Monitoreo. Convenio con la Comisaría para sumar denuncias sin datos personales.'],
      ['Mapa de calor, zonas críticas y recomendaciones', 'ok', 'Funciona', 'Revisión mensual con la Secretaría de Seguridad para decidir acciones y medir resultados.'],
      ['Planificación de rutas de patrullaje', 'ok', 'Funciona', 'Cargar los recorridos reales y revisarlos cada trimestre.'],
      ['Ruteo del móvil más cercano', 'ok', 'Funciona con un servicio público de prueba (OSRM)', 'Servidor de ruteo propio con el mapa de OpenStreetMap para no depender de un servicio externo.'],
      ['Patrullas en tiempo real', 'sim', 'Simulado', 'GPS en cada móvil (equipo AVL o app en celular con datos móviles) y un servidor que reciba las posiciones.'],
      ['Cámaras en vivo', 'sim', 'Video simulado', 'Relevar las cámaras existentes, enlace de datos (fibra o radioenlace), servidor de video (VMS) y puesto con pantallas.'],
      ['SOS ciudadano', 'sim', 'Simulado', 'App municipal o botón antipánico con usuarios validados. Coordinación con el 911 provincial para no duplicar la atención.'],
      ['Alertas de video analítica (IA)', 'sim', 'Simulado', 'Software de análisis de video con servidor con GPU. Prueba piloto en pocas cámaras para medir falsos positivos. Siempre con validación de un operador.'],
      ['Usuarios, seguridad y datos personales', 'sim', 'Login de demostración', 'Usuarios reales con roles, contraseñas seguras, registro de auditoría, HTTPS y copias de seguridad. Cumplir la Ley 25.326 y fijar por ordenanza la cartelería y el plazo de guardado de imágenes.']
    ];
    $('#sec-hoja').innerHTML = `<div class="page">
      <div class="page-head"><div><h2>Hoja de ruta del proyecto</h2><p>Qué muestra esta demo, qué está simulado y qué hace falta para ponerlo en marcha de verdad, por etapas.</p></div></div>
      <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Módulo</th><th>En la demo</th><th>Para funcionar en la ciudad</th></tr></thead><tbody>
        ${rows.map(r => `<tr style="cursor:default"><td><b>${r[0]}</b></td><td><span class="tag ${r[1] === 'ok' ? 'tag-ok' : 'tag-sim'}">${r[2]}</span></td><td class="muted">${r[3]}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card">
        ${[
          ['Etapa 1', '0 a 3 meses', 'Base de datos y mapa', ['Registro de incidentes por operadores y vecinos', 'Mapa de calor, estadísticas e informes mensuales', 'Capacitación del personal del Centro de Monitoreo', 'Inversión baja: una PC, conexión y el sistema']],
          ['Etapa 2', '3 a 6 meses', 'Conectar lo que ya existe', ['GPS en los móviles municipales', 'Integrar las cámaras actuales al Centro de Monitoreo', 'Canal de reportes de vecinos (WhatsApp o app)', 'Rutas de patrullaje basadas en datos']],
          ['Etapa 3', '6 a 12 meses', 'Ampliar y automatizar', ['Prueba piloto de video analítica en accesos (lectura de patentes)', 'Botón SOS ciudadano coordinado con el 911', 'Convenio de intercambio de datos con la Policía', 'Nuevas cámaras donde el análisis muestre huecos de cobertura']]
        ].map(([t, w, h, items]) => `<div class="phase" style="border-bottom:1px solid var(--border)"><div><h4>${t}</h4><div class="when">${w}</div></div><div><b>${h}</b><ul style="margin-top:8px">${items.map(i => `<li>${i}</li>`).join('')}</ul></div></div>`).join('')}
        <div class="phase"><div><h4>Siempre</h4><div class="when">cada 3 meses</div></div><div><b>Medir resultados</b><ul style="margin-top:8px"><li>Comparar incidentes por zona antes y después de cada acción</li><li>Tiempo de respuesta promedio y casos cerrados</li><li>Falsos positivos de las alertas automáticas</li></ul></div></div>
      </div></div>`;
  };
})(window.MT);
