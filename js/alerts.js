/* Alertas de video analítica (SIMULADAS): genera eventos sobre las cámaras y permite atenderlos. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  const KINDS = [
    { key: 'merodeo', label: 'Persona merodeando más de 5 min', level: 'media', entity: 'persona', entityLabel: 'Persona', w: 5, inc: 'otro' },
    { key: 'nocturno', label: 'Movimiento en zona comercial fuera de horario', level: 'alta', entity: 'persona', entityLabel: 'Persona', w: 3, inc: 'comercio' },
    { key: 'moto', label: 'Moto con dos ocupantes detenida, sin patente visible', level: 'media', entity: 'moto', entityLabel: 'Moto', w: 4, inc: 'otro' },
    { key: 'aglomeracion', label: 'Aglomeración inusual de personas', level: 'baja', entity: 'persona', entityLabel: 'Grupo', w: 2, inc: 'otro' },
    { key: 'vehiculo', label: 'Vehículo detenido con motor encendido > 10 min', level: 'baja', entity: 'auto', entityLabel: 'Vehículo', w: 3, inc: 'otro' },
    { key: 'lpr', label: 'Patente con pedido de secuestro (lectura LPR)', level: 'alta', entity: 'auto', entityLabel: 'Vehículo', w: 2, lpr: true, inc: 'otro' },
    { key: 'caida', label: 'Persona caída en la vía pública', level: 'media', entity: 'persona', entityLabel: 'Persona', w: 1, inc: null }
  ];
  const LEVEL = { alta: ['Alta', 'tag-danger'], media: ['Media', 'tag-warn'], baja: ['Baja', 'tag-info'] };
  const STATUS = { activa: 'Sin atender', descartada: 'Descartada (falso positivo)', despachada: 'Móvil despachado', incidente: 'Registrada como incidente', vencida: 'Vencida sin atender' };

  const A = MT.Alerts = { list: [], running: true, markers: {}, seq: 0, KINDS };
  A.activeFor = camId => A.list.find(a => a.camId === camId && a.status === 'activa');
  A.forCamera = camId => A.list.filter(a => a.camId === camId);
  A.active = () => A.list.filter(a => a.status === 'activa');
  A.statusLabel = a => STATUS[a.status];
  A.levelTag = a => `<span class="tag ${LEVEL[a.level][1]}">${LEVEL[a.level][0]}</span>`;
  const plate = r => { const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'; const c = () => L[Math.floor(r() * L.length)]; return `${c()}${c()} ${Math.floor(100 + r() * 900)} ${c()}${c()}`; };

  function make(kind, cam, t, rand = Math.random) {
    A.seq++;
    return {
      id: `IA-${String(A.seq).padStart(4, '0')}`, camId: cam.id, key: kind.key, label: kind.label, level: kind.level,
      entity: kind.entity, entityLabel: kind.entityLabel, inc: kind.inc,
      confidence: 0.62 + rand() * 0.33, t, status: 'activa',
      extra: kind.lpr ? `Patente leída: ${plate(rand)}` : ''
    };
  }

  // Historial del día (ya atendido) para que la demo no arranque vacía
  function seedHistory() {
    const r = MT.seeded(99);
    const online = MT.Cameras.cams.filter(c => c.status === 'online');
    const outcomes = ['descartada', 'descartada', 'despachada', 'incidente', 'descartada', 'despachada', 'descartada', 'incidente', 'descartada', 'descartada'];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const span = Math.max(1, Date.now() - start.getTime() - 15 * 60000);
    for (let i = 0; i < 10; i++) {
      const kind = KINDS[MT.pickWeighted(r, KINDS.map(k => k.w))];
      const cams = kind.lpr ? online.filter(c => c.kind === 'LPR') : online.filter(c => c.kind !== 'LPR');
      const a = make(kind, cams[Math.floor(r() * cams.length)], start.getTime() + r() * span, r);
      a.status = outcomes[i];
      A.list.push(a);
    }
    A.list.sort((a, b) => b.t - a.t);
  }

  A.init = function () {
    seedHistory();
    A.render();
    const loop = () => {
      setTimeout(() => { if (A.running) A.generate(); loop(); }, 35000 + Math.random() * 35000);
    };
    setTimeout(() => { if (A.running) A.generate(); loop(); }, 15000);
  };

  A.generate = function (forcedKey) {
    const kind = forcedKey ? KINDS.find(k => k.key === forcedKey) : KINDS[MT.pickWeighted(Math.random, KINDS.map(k => k.w))];
    const free = MT.Cameras.cams.filter(c => c.status === 'online' && !A.activeFor(c.id) && (kind.lpr ? c.kind === 'LPR' : c.kind !== 'LPR'));
    if (!free.length) return null;
    const cam = free[Math.floor(Math.random() * free.length)];
    const a = make(kind, cam, Date.now());
    A.list.unshift(a);
    // Máximo 4 alertas abiertas: la más vieja se vence
    const open = A.active();
    if (open.length > 4) { const old = open[open.length - 1]; old.status = 'vencida'; clearAlert(old); }

    const m = L.marker(cam.pos, { icon: L.divIcon({ className: '', html: '<div class="pulse-marker" style="--c:#a78bfa"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1500 })
      .bindPopup(() => popup(a), { minWidth: 250 }).addTo(MT.Map.layers.alerts);
    A.markers[a.id] = m;
    MT.Cameras.notifyAlert(cam.id, a);
    MT.toast({
      title: `Alerta IA · ${cam.name}`, msg: `${esc(a.label)} — confianza ${Math.round(a.confidence * 100)}%`, level: 'ia', timeout: 12000,
      actions: [{ label: 'Ver cámara', primary: true, fn: () => A.view(a.id) }, { label: 'Despachar móvil', fn: () => A.dispatch(a.id) }]
    });
    MT.beep('alert');
    changed();
    return a;
  };

  function clearAlert(a) {
    const m = A.markers[a.id];
    if (m) { MT.Map.layers.alerts.removeLayer(m); delete A.markers[a.id]; }
    MT.Cameras.notifyAlert(a.camId, null);
  }
  function changed() {
    A.render();
    MT.App.updateBadges();
    document.dispatchEvent(new CustomEvent('mt:alerts'));
  }
  const get = id => A.list.find(a => a.id === id);

  A.view = id => { const a = get(id); MT.Cameras.open(a.camId); };
  A.dispatch = function (id) {
    const a = get(id); if (!a || a.status !== 'activa') return;
    const cam = MT.Cameras.get(a.camId);
    a.status = 'despachada'; clearAlert(a); changed();
    MT.SOS.createCase({ kind: 'ia', typeLabel: a.label, incType: a.inc, pos: cam.pos, origin: `Cámara ${cam.id} · ${cam.name}`, alertId: a.id });
  };
  A.discard = function (id) {
    const a = get(id); if (!a) return;
    a.status = 'descartada'; clearAlert(a); changed();
    MT.toast({ title: 'Alerta descartada', msg: 'Se marca como falso positivo. Este dato sirve para ajustar el modelo.', level: 'info', timeout: 4000 });
  };
  A.toIncident = function (id) {
    const a = get(id); if (!a) return;
    const cam = MT.Cameras.get(a.camId);
    a.status = 'incidente'; clearAlert(a); changed();
    MT.Map.openIncidentForm(cam.pos, { type: a.inc || 'otro', source: 'Cámara municipal', desc: `Generado desde alerta ${a.id}: ${a.label}. ${a.extra || ''}` });
  };

  function actions(a) {
    if (a.status !== 'activa') return '';
    return `<div class="acts">
      <button class="btn btn-xs btn-primary" data-act="view" data-id="${a.id}">${icon('eye', 13)} Ver cámara</button>
      <button class="btn btn-xs btn-danger" data-act="dispatch" data-id="${a.id}">${icon('car', 13)} Despachar</button>
      <button class="btn btn-xs" data-act="incident" data-id="${a.id}">${icon('plus', 13)} Incidente</button>
      <button class="btn btn-xs btn-ghost" data-act="discard" data-id="${a.id}">Descartar</button></div>`;
  }
  function bind(root) {
    root.querySelectorAll('[data-act]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      MT.Map.map.closePopup();
      ({ view: A.view, dispatch: A.dispatch, incident: A.toIncident, discard: A.discard })[b.dataset.act](b.dataset.id);
    });
  }
  function popup(a) {
    const cam = MT.Cameras.get(a.camId);
    const el = MT.h(`<div class="pop"><h4>${icon('cpu', 15)} ${esc(a.label)}</h4>
      <div class="kv"><span>Cámara</span><span>${cam.id} · ${esc(cam.name)}</span><span>Hora</span><span>${fmt.time(a.t, true)}</span>
      <span>Prioridad</span><span>${A.levelTag(a)}</span><span>Confianza</span><span>${Math.round(a.confidence * 100)}%</span>
      ${a.extra ? `<span>Dato</span><span class="mono">${esc(a.extra)}</span>` : ''}</div>${actions(a)}</div>`);
    bind(el);
    return el;
  }
  function item(a) {
    const cam = MT.Cameras.get(a.camId);
    return `<div class="feed-item lvl-${a.level} ${a.status !== 'activa' ? 'done' : ''}">
      <div class="ttl"><span>${esc(a.label)}</span>${A.levelTag(a)}</div>
      <div class="meta"><span>${fmt.time(a.t)}</span><span>${esc(cam.name)}</span><span>${Math.round(a.confidence * 100)}%</span>${a.status !== 'activa' ? `<span>${STATUS[a.status]}</span>` : ''}${a.extra ? `<span class="mono">${esc(a.extra)}</span>` : ''}</div>
      ${actions(a)}</div>`;
  }

  /* ---------- Vistas ---------- */
  A.render = function () {
    const el = $('#rp-alertas');
    if (el) {
      el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px">
          <span class="row" style="gap:7px;font-size:12px"><i class="dot ${A.running ? 'dot-live' : ''}" style="${A.running ? '' : 'background:#64748b'}"></i>Motor de análisis ${A.running ? 'activo' : 'en pausa'}</span>
          <button class="btn btn-xs" id="ia-toggle">${icon(A.running ? 'pause' : 'play', 12)} ${A.running ? 'Pausar' : 'Reanudar'}</button></div>
        <div class="note" style="margin-bottom:10px">${icon('cpu', 15)}<span><b>Módulo en fase de prueba (simulado).</b> Las alertas son sugerencias: siempre las valida un operador antes de actuar.</span></div>
        <div class="feed">${A.list.slice(0, 15).map(item).join('') || '<div class="empty">Sin alertas</div>'}</div>`;
      bind(el);
      el.querySelector('#ia-toggle').onclick = () => { A.running = !A.running; A.render(); };
    }
    const lc = $('#lc-alerts'); if (lc) lc.textContent = A.active().length || '';
    const pill = $('#pill-alertas');
    if (pill) { const n = A.active().length; pill.textContent = n; pill.classList.toggle('hidden', !n); }
    if ($('#sec-alertas.active')) A.renderSection();
  };

  let tab = 'alertas';
  A.renderSection = function () {
    const sec = $('#sec-alertas');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayList = A.list.filter(a => a.t >= today.getTime());
    const closed = todayList.filter(a => a.status !== 'activa' && a.status !== 'vencida');
    const fp = closed.filter(a => a.status === 'descartada').length;
    const cases = MT.SOS.list;
    sec.innerHTML = `<div class="page">
      <div class="page-head"><div><h2>Alertas y casos</h2><p>Alertas de video analítica sobre las cámaras y casos de SOS / reportes ciudadanos con su despacho.</p></div>
        <div class="toolbar"><button class="btn btn-violet btn-sm" id="as-gen">${icon('cpu', 14)} Simular alerta IA</button><button class="btn btn-danger btn-sm" id="as-sos">${icon('radio', 14)} Simular SOS</button></div></div>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
        <div class="card kpi"><span class="lbl">${icon('cpu', 15)} Alertas IA hoy</span><span class="val">${todayList.length}</span><span class="sub">${A.active().length} sin atender</span></div>
        <div class="card kpi"><span class="lbl">${icon('x', 15)} Falsos positivos</span><span class="val">${closed.length ? fmt.pct(fp / closed.length) : '—'}</span><span class="sub">${fp} de ${closed.length} alertas revisadas</span></div>
        <div class="card kpi"><span class="lbl">${icon('radio', 15)} Casos SOS / reportes</span><span class="val">${cases.length}</span><span class="sub">${cases.filter(c => c.state !== 'resuelto' && c.state !== 'cancelado').length} en curso</span></div>
        <div class="card kpi"><span class="lbl">${icon('clock', 15)} Respuesta promedio</span><span class="val">${(() => { const r = cases.filter(c => c.respSec); return r.length ? fmt.dur(r.reduce((s, c) => s + c.respSec, 0) / r.length) : '—'; })()}</span><span class="sub">casos de esta sesión (escala real)</span></div>
      </div>
      <div class="card"><div class="card-head"><div class="seg" id="as-tabs"><button data-v="alertas" class="${tab === 'alertas' ? 'active' : ''}">Alertas IA</button><button data-v="casos" class="${tab === 'casos' ? 'active' : ''}">Casos y despachos</button></div></div>
        <div class="card-body">${tab === 'alertas' ? alertsTable() : casesTable(cases)}</div></div>
    </div>`;
    bind(sec);
    $$('#as-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.v; A.renderSection(); });
    $('#as-gen').onclick = () => { const a = A.generate(); if (!a) MT.toast({ title: 'No hay cámaras libres', msg: 'Todas las cámaras en línea tienen una alerta abierta.', level: 'warn' }); };
    $('#as-sos').onclick = () => MT.SOS.openSimulator('sos');
    sec.querySelectorAll('[data-case]').forEach(r => r.onclick = () => MT.SOS.focusCase(r.dataset.case));
  };

  function alertsTable() {
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Hora</th><th>Detección</th><th>Cámara</th><th>Prioridad</th><th>Confianza</th><th>Estado</th><th></th></tr></thead><tbody>
      ${A.list.map(a => {
        const cam = MT.Cameras.get(a.camId);
        return `<tr><td class="mono">${a.id}</td><td class="mono">${fmt.time(a.t)}</td><td>${esc(a.label)}${a.extra ? `<div class="muted mono" style="font-size:11.5px">${esc(a.extra)}</div>` : ''}</td><td>${esc(cam.name)}</td><td>${A.levelTag(a)}</td><td class="mono">${Math.round(a.confidence * 100)}%</td><td>${STATUS[a.status]}</td>
        <td>${a.status === 'activa' ? `<div class="row" style="gap:6px"><button class="btn btn-xs btn-primary" data-act="view" data-id="${a.id}">Ver</button><button class="btn btn-xs btn-danger" data-act="dispatch" data-id="${a.id}">Despachar</button><button class="btn btn-xs" data-act="discard" data-id="${a.id}">Descartar</button></div>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function casesTable(cases) {
    if (!cases.length) return `<div class="empty">Todavía no hay casos en esta sesión. Probá el botón <b>SOS</b> arriba del mapa.</div>`;
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Caso</th><th>Hora</th><th>Tipo</th><th>Lugar</th><th>Móvil</th><th>Estado</th><th>Respuesta</th></tr></thead><tbody>
      ${cases.map(c => `<tr data-case="${c.id}"><td class="mono">${c.id}</td><td class="mono">${fmt.time(c.created)}</td><td>${MT.SOS.kindTag(c)} ${esc(c.typeLabel)}</td><td>${esc(c.addr)}</td><td>${c.unitId ? esc(MT.Patrols.get(c.unitId).name) : '—'}</td><td>${MT.SOS.stateLabel(c)}</td><td class="mono">${c.respSec ? fmt.dur(c.respSec) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
})(window.MT);
