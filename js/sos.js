/* SOS ciudadano, reportes de vecinos y despachos: busca el móvil más cercano, traza la ruta y sigue el caso. */
(function (MT) {
  'use strict';
  const D = MT.Data, P = () => MT.Patrols;
  const { $, $$, icon, esc, fmt } = MT;

  const TYPES = {
    sos: [
      { k: 'robo', label: 'Robo en curso / me están robando', inc: 'via_publica' },
      { k: 'amenaza', label: 'Amenaza o persona armada', inc: 'otro' },
      { k: 'vivienda', label: 'Intrusos en una vivienda', inc: 'vivienda' },
      { k: 'violencia', label: 'Violencia / pelea', inc: 'otro' },
      { k: 'emergencia', label: 'Accidente / emergencia médica', inc: null }
    ],
    vecino: [
      { k: 'sospechoso', label: 'Persona sospechosa merodeando', inc: 'otro' },
      { k: 'vehiculo', label: 'Vehículo sospechoso', inc: 'otro' },
      { k: 'moto', label: 'Me robaron la moto / bici recién', inc: 'moto' },
      { k: 'ruidos', label: 'Ruidos molestos / disturbios', inc: 'otro' },
      { k: 'luminaria', label: 'Zona oscura / luminaria rota', inc: 'vandalismo' }
    ]
  };
  const ORIGINS = {
    sos: ['Botón antipánico (app ciudadana)', 'Llamada al 911', 'Botón de alerta en comercio'],
    vecino: ['App / WhatsApp municipal', 'Llamada al Centro de Monitoreo', 'Alarma comunitaria']
  };
  const KIND = {
    sos: { label: 'SOS', color: '#ef4444', tag: 'tag-danger', prefix: 'SOS', auto: 8 },
    vecino: { label: 'Reporte', color: '#f59e0b', tag: 'tag-warn', prefix: 'REP', auto: 15 },
    ia: { label: 'Alerta IA', color: '#a78bfa', tag: 'tag-violet', prefix: 'DSP', auto: 10 }
  };
  const STATES = ['recibido', 'asignado', 'en_camino', 'en_lugar', 'resuelto'];
  const STATE_LABEL = { recibido: 'Recibido', asignado: 'Asignado', en_camino: 'En camino', en_lugar: 'En el lugar', resuelto: 'Resuelto', cancelado: 'Cancelado' };
  const OUTCOMES = [
    ['aprehendido', 'Se aprehendió a los autores'],
    ['recupero', 'Se recuperaron los bienes'],
    ['sin_novedad', 'Sin novedad en el lugar'],
    ['derivado', 'Derivado (Comisaría / SIES 107 / bomberos)'],
    ['falsa', 'Falsa alarma']
  ];

  const S = MT.SOS = { list: [], seq: { SOS: 0, REP: 0, DSP: 0 } };
  S.get = id => S.list.find(c => c.id === id);
  S.kindTag = c => `<span class="tag ${KIND[c.kind].tag}">${KIND[c.kind].label}</span>`;
  S.stateLabel = c => STATE_LABEL[c.state];
  S.active = () => S.list.filter(c => c.state !== 'resuelto' && c.state !== 'cancelado');

  S.init = function () {
    S.render();
    document.addEventListener('mt:tick', updateEtas);
    document.addEventListener('mt:units', () => {
      const waiting = S.list.filter(c => c.state === 'recibido');
      if (!waiting.length) return;
      waiting.forEach(pickCandidates);
      S.render();
    });
  };

  function randomPoint() {
    const odd = 3 + Math.floor(Math.random() * 21) * 2;
    const even = 2 + Math.floor(Math.random() * 9) * 2;
    const p = D.inter(odd, even);
    return Math.random() < .5 ? [p[0] + (Math.random() - .5) * 0.0006, p[1]] : [p[0], p[1] + (Math.random() - .5) * 0.0008];
  }

  /* ---------- Simulador (modal) ---------- */
  S.openSimulator = function (kind = 'sos', presetPos = null) {
    const types = TYPES[kind];
    const m = MT.modal({
      title: kind === 'sos' ? `${icon('radio', 18)} Simular SOS ciudadano` : `${icon('phone', 18)} Simular reporte de vecino`,
      body: `<form class="stack" id="sos-form">
        <div class="note note-info">${icon('info', 15)}<span>${kind === 'sos'
          ? 'Simula lo que pasaría cuando un vecino aprieta el botón antipánico en su celular o llama al 911: llega la alerta con su ubicación y el sistema propone el móvil más cercano.'
          : 'Simula un aviso no urgente de un vecino. Se atiende con menor prioridad y su información alimenta las estadísticas.'}</span></div>
        <div><div class="muted" style="font-size:12.5px;margin-bottom:7px">Motivo</div>
          <div class="choice-grid">${types.map((t, i) => `<label class="choice ${i === 0 ? 'sel' : ''}"><input type="radio" name="type" value="${t.k}" ${i === 0 ? 'checked' : ''}>${t.label}</label>`).join('')}</div></div>
        <label class="field">Origen del aviso<select class="select" name="origin">${ORIGINS[kind].map(o => `<option>${o}</option>`).join('')}</select></label>
        ${presetPos
          ? `<div class="note note-info">${icon('pin', 15)}<span>${esc(D.address(presetPos[0], presetPos[1]))}</span></div>`
          : `<div><div class="muted" style="font-size:12.5px;margin-bottom:7px">Ubicación</div><div class="choice-grid">
              <label class="choice sel"><input type="radio" name="loc" value="random" checked>${icon('zap', 15)} Al azar en la ciudad</label>
              <label class="choice"><input type="radio" name="loc" value="pick">${icon('crosshair', 15)} Elegir en el mapa</label></div></div>`}
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button class="btn ${kind === 'sos' ? 'btn-danger' : 'btn-warn'}">${icon(kind === 'sos' ? 'radio' : 'phone', 15)} ${kind === 'sos' ? 'Enviar SOS' : 'Enviar reporte'}</button></div>
      </form>`
    });
    const form = m.body.querySelector('form');
    form.querySelectorAll('.choice input').forEach(inp => inp.onchange = () => {
      form.querySelectorAll(`input[name="${inp.name}"]`).forEach(o => o.closest('.choice').classList.toggle('sel', o.checked));
    });
    form.querySelector('[data-cancel]').onclick = m.close;
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const t = types.find(x => x.k === fd.get('type'));
      m.close();
      let pos = presetPos;
      if (!pos) pos = fd.get('loc') === 'pick' ? await MT.Map.pickPoint(kind === 'sos' ? 'Hacé clic en el mapa donde está la persona que pide ayuda' : 'Hacé clic en el mapa donde ocurre lo reportado', kind === 'sos' ? '' : 'info') : randomPoint();
      if (!pos) return;
      S.createCase({ kind, typeLabel: t.label, incType: t.inc, pos, origin: fd.get('origin') });
    };
  };

  /* ---------- Ciclo de vida del caso ---------- */
  S.createCase = function ({ kind, typeLabel, incType, pos, origin, alertId }) {
    const k = KIND[kind];
    const n = ++S.seq[k.prefix];
    const c = {
      id: `${k.prefix}-${String(n).padStart(3, '0')}`, kind, typeLabel, incType, pos, origin, alertId,
      addr: D.address(pos[0], pos[1]), zone: D.zoneOf(pos[0], pos[1]),
      created: Date.now(), state: 'recibido', timeline: [], unitId: null, autoLeft: k.auto
    };
    log(c, 'Aviso recibido', origin);
    S.list.unshift(c);

    c.marker = L.marker(pos, { icon: L.divIcon({ className: '', html: `<div class="pulse-marker" style="--c:${k.color}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 2000 })
      .bindTooltip(`${c.id} · ${esc(typeLabel)}`, { direction: 'top', offset: [0, -12] })
      .on('click', () => S.focusCase(c.id)).addTo(MT.Map.layers.cases);

    pickCandidates(c);
    MT.App.go('mapa');
    MT.Map.showRightTab('casos');
    const near = c.candidates[0];
    setTimeout(() => {
      if (near) MT.Map.map.flyToBounds(L.latLngBounds([pos, near.unit.pos]).pad(0.4), { duration: .8, maxZoom: 17 });
      else MT.Map.map.flyTo(pos, 16);
    }, 80);

    MT.toast({
      title: `${kind === 'sos' ? 'SOS' : kind === 'ia' ? 'Despacho por alerta IA' : 'Reporte de vecino'} · ${c.id}`,
      msg: `${esc(typeLabel)}<br>${esc(c.addr)}${near ? ` · Móvil más cercano: <b>${esc(near.unit.name)}</b> a ${fmt.dist(near.dist)}` : ''}`,
      level: kind === 'sos' ? 'sos' : kind === 'ia' ? 'ia' : 'warn', timeout: 9000
    });
    MT.beep(kind === 'sos' ? 'sos' : 'alert');

    c.timer = setInterval(() => {
      if (c.state !== 'recibido' || c.autoPaused) return;
      c.autoLeft--;
      const el = $(`#auto-${c.id}`);
      if (el) el.textContent = c.autoLeft;
      if (c.autoLeft <= 0) { S.dispatch(c.id, c.sel, true); }
    }, 1000);
    S.render();
    MT.App.updateBadges();
    return c;
  };

  function pickCandidates(c) {
    c.candidates = P().nearest(c.pos).slice(0, 3);
    if (!c.candidates.find(x => x.unit.id === c.sel)) c.sel = c.candidates[0] ? c.candidates[0].unit.id : null;
  }

  function log(c, label, detail = '') { c.timeline.push({ t: Date.now(), label, detail }); }

  S.dispatch = async function (id, unitId, automatic = false) {
    const c = S.get(id);
    if (!c || c.state !== 'recibido') return;
    if (!unitId) { MT.toast({ title: 'No hay móviles disponibles', msg: 'Todos los móviles están ocupados. El caso queda en espera.', level: 'warn' }); c.autoPaused = true; S.render(); return; }
    clearInterval(c.timer);
    const u = P().get(unitId);
    c.unitId = unitId; c.state = 'asignado'; c.dispatchedAt = Date.now();
    log(c, `Asignado a ${u.name}`, automatic ? 'Despacho automático (móvil más cercano)' : 'Asignado por el operador');
    S.render();
    const route = await P().dispatch(unitId, c.pos, c.id, () => arrived(c));
    if (!route || c.unitId !== unitId) return;
    c.state = 'en_camino'; c.route = route;
    c.etaReal = route.distance / P().SPEED.dispatch;
    log(c, 'En camino', `Ruta ${fmt.dist(route.distance)} · ETA ${fmt.dur(c.etaReal)}${route.source === 'osrm' ? ' (por calles)' : ' (aproximada)'}`);
    drawRoute(c);
    MT.Map.map.flyToBounds(L.latLngBounds(route.path).pad(0.3), { duration: .8, maxZoom: 17 });
    MT.toast({ title: `${u.name} despachado`, msg: `${c.id} · ${fmt.dist(route.distance)} de recorrido · llegada estimada en ${fmt.dur(c.etaReal)}`, level: 'info', timeout: 6000 });
    S.render();
  };

  function drawRoute(c) {
    removeRoute(c);
    c.routeLine = L.layerGroup([
      L.polyline(c.route.path, { color: '#000', weight: 9, opacity: .35 }),
      L.polyline(c.route.path, { color: KIND[c.kind].color, weight: 5, opacity: .95, className: 'route-anim' })
    ]).addTo(MT.Map.layers.cases);
  }
  function removeRoute(c) { if (c.routeLine) { MT.Map.layers.cases.removeLayer(c.routeLine); c.routeLine = null; } }

  function arrived(c) {
    if (c.state !== 'en_camino') return;
    c.state = 'en_lugar'; c.arrivedAt = Date.now();
    // Tiempo de respuesta en escala real: demora del operador + viaje a velocidad real
    c.respSec = (c.dispatchedAt - c.created) / 1000 + c.etaReal;
    const u = P().get(c.unitId);
    log(c, `${u.name} en el lugar`, `Tiempo de respuesta: ${fmt.dur(c.respSec)}`);
    removeRoute(c);
    MT.beep('ok');
    MT.toast({ title: `${u.name} llegó al lugar`, msg: `${c.id} · respuesta total ${fmt.dur(c.respSec)} (escala real)`, level: 'ok', actions: [{ label: 'Cerrar caso', primary: true, fn: () => S.resolve(c.id) }] });
    S.render();
  }

  S.reassign = function (id) {
    const c = S.get(id);
    if (!c || !c.unitId) return;
    const prev = P().get(c.unitId);
    P().release(c.unitId);
    removeRoute(c);
    log(c, `Se libera a ${prev.name}`, 'Reasignación');
    c.unitId = null; c.state = 'recibido'; c.autoPaused = true; c.autoLeft = 0;
    pickCandidates(c);
    c.candidates = c.candidates.filter(x => x.unit.id !== prev.id);
    c.sel = c.candidates[0] ? c.candidates[0].unit.id : null;
    S.render();
  };

  S.cancel = function (id) {
    const c = S.get(id);
    clearInterval(c.timer);
    if (c.unitId) P().release(c.unitId);
    removeRoute(c);
    MT.Map.layers.cases.removeLayer(c.marker);
    c.state = 'cancelado';
    log(c, 'Caso cancelado por el operador');
    S.render(); MT.App.updateBadges();
  };

  S.resolve = function (id) {
    const c = S.get(id);
    if (!c || c.state !== 'en_lugar') return;
    const m = MT.modal({
      title: `${icon('check', 18)} Cerrar caso ${c.id}`,
      body: `<form class="stack">
        <div class="muted">${esc(c.typeLabel)} · ${esc(c.addr)}</div>
        <div class="choice-grid" style="grid-template-columns:1fr">${OUTCOMES.map((o, i) => `<label class="choice ${i === 2 ? 'sel' : ''}"><input type="radio" name="out" value="${o[0]}" ${i === 2 ? 'checked' : ''}>${o[1]}</label>`).join('')}</div>
        <label class="field">Observaciones del móvil<textarea class="input" name="obs" placeholder="Breve informe de lo actuado"></textarea></label>
        ${c.incType ? `<label class="check"><input type="checkbox" name="reg" checked> Registrar como incidente en el historial (alimenta el mapa de calor y las estadísticas)</label>` : ''}
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-cancel>Volver</button><button class="btn btn-primary">${icon('check', 15)} Cerrar caso</button></div></form>`
    });
    const form = m.body.querySelector('form');
    form.querySelectorAll('.choice input').forEach(inp => inp.onchange = () => form.querySelectorAll('.choice').forEach(ch => ch.classList.toggle('sel', ch.querySelector('input').checked)));
    form.querySelector('[data-cancel]').onclick = m.close;
    form.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(form);
      const out = OUTCOMES.find(o => o[0] === fd.get('out'));
      c.outcome = out[1];
      c.state = 'resuelto';
      log(c, 'Caso cerrado', out[1] + (fd.get('obs') ? ` — ${fd.get('obs')}` : ''));
      if (c.incType && fd.get('reg') && out[0] !== 'falsa') {
        const inc = D.addIncident({
          type: c.incType, lat: c.pos[0], lng: c.pos[1], t: c.created, status: out[0] === 'aprehendido' ? 'investigacion' : 'abierto',
          source: c.kind === 'ia' ? 'Cámara municipal' : c.kind === 'sos' ? '911' : 'Vecino',
          respMin: Math.max(1, Math.round(c.respSec / 60)),
          desc: `${c.typeLabel}. ${out[1]}.${fd.get('obs') ? ' ' + fd.get('obs') : ''} (Caso ${c.id})`
        });
        log(c, `Registrado como ${inc.id}`);
      }
      P().release(c.unitId);
      MT.Map.layers.cases.removeLayer(c.marker);
      m.close();
      MT.toast({ title: `Caso ${c.id} cerrado`, msg: `${esc(out[1])}. El móvil vuelve a su recorrido.`, level: 'ok', timeout: 5000 });
      S.render(); MT.App.updateBadges();
    };
  };

  S.focusCase = function (id) {
    const c = S.get(id);
    MT.App.go('mapa');
    MT.Map.showRightTab('casos');
    setTimeout(() => MT.Map.map.flyTo(c.pos, 17, { duration: .7 }), 60);
    setTimeout(() => { const el = $(`#case-${id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 120);
  };

  function updateEtas() {
    S.list.forEach(c => {
      if (c.state !== 'en_camino') return;
      const u = P().get(c.unitId);
      const rem = P().remaining(u);
      const eta = $(`#eta-${c.id}`), dist = $(`#dist-${c.id}`);
      if (eta) eta.textContent = fmt.dur(rem / P().SPEED.dispatch);
      if (dist) dist.textContent = fmt.dist(rem);
    });
  }

  /* ---------- Panel de casos ---------- */
  function card(c) {
    const k = KIND[c.kind];
    const idx = STATES.indexOf(c.state);
    const u = c.unitId && P().get(c.unitId);
    let body = '';
    if (c.state === 'recibido') {
      body = c.candidates.length ? `<div class="muted" style="font-size:11.5px;margin-top:8px">Móviles disponibles más cercanos</div>
        ${c.candidates.map((x, i) => `<div class="cand ${x.unit.id === c.sel ? 'sel' : ''}" data-sel="${x.unit.id}" data-case="${c.id}">
          <div class="grow"><div class="u">${esc(x.unit.name)}${i === 0 ? ' <span class="tag tag-info" style="font-size:9.5px;padding:0 6px">Más cercano</span>' : ''}</div><div class="muted" style="font-size:11px">${P().LABEL[x.unit.mode]}</div></div>
          <span class="d">${fmt.dist(x.dist)}<br>~${fmt.dur(x.eta)}</span></div>`).join('')}
        <button class="btn btn-sm btn-danger btn-block" style="margin-top:10px" data-dispatch="${c.id}">${icon('car', 14)} Despachar ${esc((P().get(c.sel) || {}).name || '')}</button>
        <div class="row" style="margin-top:6px;justify-content:space-between">
          ${!c.autoPaused ? `<button class="btn btn-xs btn-ghost" data-pause="${c.id}" title="Detener despacho automático">Despacho automático en <b id="auto-${c.id}">${c.autoLeft}</b> s · detener</button>` : '<span class="dim" style="font-size:11.5px">Despacho manual</span>'}
          <button class="btn btn-xs btn-ghost" data-cancel="${c.id}">Cancelar caso</button></div>`
        : `<div class="note" style="margin-top:8px">${icon('alert', 15)}<span>No hay móviles disponibles. Liberá uno desde la pestaña Móviles o esperá.</span></div>
          <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-refresh="${c.id}">Buscar de nuevo</button><button class="btn btn-sm btn-ghost" data-cancel="${c.id}">Cancelar</button></div>`;
    } else if (c.state === 'asignado') {
      body = `<div class="muted" style="margin-top:6px">Calculando ruta para <b>${esc(u.name)}</b>…</div>`;
    } else if (c.state === 'en_camino') {
      body = `<div class="row" style="margin-top:4px;align-items:flex-end"><div class="grow"><div class="muted" style="font-size:11px">Llegada estimada</div><div class="eta" id="eta-${c.id}">${fmt.dur(P().remaining(u) / P().SPEED.dispatch)}</div></div>
          <div style="text-align:right"><div class="muted" style="font-size:11px">Falta</div><div class="mono" id="dist-${c.id}">${fmt.dist(P().remaining(u))}</div></div></div>
        <div class="muted" style="font-size:11.5px;margin-top:4px">${esc(u.name)} · ${c.route.source === 'osrm' ? 'ruta por calles' : 'ruta aproximada (sin conexión al servicio de ruteo)'}</div>
        <div class="row" style="margin-top:9px"><button class="btn btn-sm" data-follow="${u.id}">${icon('crosshair', 14)} Seguir móvil</button><button class="btn btn-sm btn-ghost" data-reassign="${c.id}">Reasignar</button></div>`;
    } else if (c.state === 'en_lugar') {
      body = `<div style="margin-top:6px"><b>${esc(u.name)}</b> está en el lugar. Respuesta: <b class="mono">${fmt.dur(c.respSec)}</b></div>
        <div class="row" style="margin-top:9px"><button class="btn btn-sm btn-primary grow" data-resolve="${c.id}">${icon('check', 14)} Cerrar caso</button></div>`;
    } else {
      body = `<div class="muted" style="margin-top:6px">${c.state === 'resuelto' ? esc(c.outcome || '') : 'Cancelado'}${c.respSec ? ` · respuesta ${fmt.dur(c.respSec)}` : ''}</div>`;
    }
    return `<div class="case kind-${c.kind} ${idx < 0 || c.state === 'resuelto' ? 'resolved' : ''}" id="case-${c.id}">
      <div class="case-head"><div><strong>${esc(c.typeLabel)}</strong><span class="muted" style="font-size:11.5px">${c.id} · ${esc(c.addr)} · ${fmt.time(c.created, true)}</span></div>${`<span class="tag ${k.tag}">${k.label}</span>`}</div>
      ${c.state !== 'cancelado' ? `<div class="steps">${STATES.map((s, i) => `<span class="${i < idx || (i === idx && c.state === 'resuelto') ? 'on' : i === idx ? 'cur' : ''}"></span>`).join('')}</div>
      <div class="step-label"><span>${STATE_LABEL[c.state]}</span><span>${idx + 1}/5</span></div>` : ''}
      ${body}
      <details style="margin-top:8px"><summary class="muted" style="font-size:11.5px;cursor:pointer">Línea de tiempo (${c.timeline.length})</summary>
        <ul class="timeline">${c.timeline.map(e => `<li><span class="mono">${fmt.time(e.t, true)}</span><span><b>${esc(e.label)}</b>${e.detail ? ` — ${esc(e.detail)}` : ''}</span></li>`).join('')}</ul></details>
    </div>`;
  }

  S.render = function () {
    const el = $('#rp-casos');
    if (!el) return;
    const active = S.active();
    const done = S.list.filter(c => !active.includes(c)).slice(0, 5);
    el.innerHTML = `<div class="stack" style="gap:8px;margin-bottom:12px">
        <button class="btn btn-sos btn-block" data-new="sos">${icon('radio', 16)} Simular SOS ciudadano</button>
        <div class="row"><button class="btn btn-warn btn-sm grow" data-new="vecino">${icon('phone', 14)} Reporte de vecino</button><button class="btn btn-violet btn-sm grow" data-new="ia">${icon('cpu', 14)} Alerta IA</button></div></div>
      <h4 class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;margin:4px 0 8px">Casos en curso (${active.length})</h4>
      <div class="stack" style="gap:10px">${active.map(card).join('') || '<div class="empty">No hay casos en curso.<br>Usá los botones de arriba o hacé clic derecho en el mapa.</div>'}</div>
      ${done.length ? `<h4 class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;margin:16px 0 8px">Últimos cerrados</h4><div class="stack" style="gap:8px">${done.map(card).join('')}</div>` : ''}`;
    el.querySelectorAll('[data-new]').forEach(b => b.onclick = () => b.dataset.new === 'ia' ? MT.Alerts.generate() : S.openSimulator(b.dataset.new));
    el.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { const c = S.get(b.dataset.case); c.sel = b.dataset.sel; c.autoPaused = true; S.render(); });
    el.querySelectorAll('[data-dispatch]').forEach(b => b.onclick = () => { const c = S.get(b.dataset.dispatch); S.dispatch(c.id, c.sel); });
    el.querySelectorAll('[data-pause]').forEach(b => b.onclick = () => { S.get(b.dataset.pause).autoPaused = true; S.render(); });
    el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => S.cancel(b.dataset.cancel));
    el.querySelectorAll('[data-refresh]').forEach(b => b.onclick = () => { pickCandidates(S.get(b.dataset.refresh)); S.render(); });
    el.querySelectorAll('[data-follow]').forEach(b => b.onclick = () => P().follow(b.dataset.follow));
    el.querySelectorAll('[data-reassign]').forEach(b => b.onclick = () => S.reassign(b.dataset.reassign));
    el.querySelectorAll('[data-resolve]').forEach(b => b.onclick = () => S.resolve(b.dataset.resolve));
    const pill = $('#pill-casos');
    if (pill) { pill.textContent = active.length; pill.classList.toggle('hidden', !active.length); }
    if ($('#sec-alertas.active')) MT.Alerts.renderSection();
  };
})(window.MT);
