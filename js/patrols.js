/* Móviles en "tiempo real" (simulado): recorren sus circuitos por las calles, se despachan a casos y vuelven. */
(function (MT) {
  'use strict';
  const D = MT.Data, G = MT.Geo;
  const { $, icon, esc, fmt } = MT;

  const SPEED = { patrol: { auto: 7, policia: 7, moto: 6 }, dispatch: 12.5 }; // m/s reales (25 y 45 km/h)
  const MOVING = ['patrol', 'dispatch', 'return'];
  const LABEL = { patrol: 'Patrullando', dispatch: 'En camino a un caso', assigning: 'Calculando ruta…', onscene: 'En el lugar', return: 'Volviendo al recorrido', hold: 'Detenido', base: 'En base', oos: 'Fuera de servicio' };
  const TAGCLS = { patrol: 'tag-ok', dispatch: 'tag-danger', assigning: 'tag-danger', onscene: 'tag-warn', return: 'tag-info', hold: '', base: '', oos: '' };
  const BASE_POS = D.inter(21, 6);

  const P = MT.Patrols = { units: [], following: null, SPEED, LABEL };

  P.get = id => P.units.find(u => u.id === id);
  P.available = () => P.units.filter(u => ['patrol', 'return', 'base'].includes(u.mode));
  P.statusTag = u => `<span class="tag ${TAGCLS[u.mode]}">${LABEL[u.mode]}</span>`;
  P.speedKmh = u => MOVING.includes(u.mode) ? Math.round((u.mode === 'patrol' ? SPEED.patrol[u.kind] : SPEED.dispatch) * 3.6) : 0;

  P.init = function (map) {
    const rand = MT.seeded(7);
    P.units = D.UNITS.map(u => {
      const loopPrep = G.prepare(u.loop);
      return Object.assign({}, u, { mode: 'patrol', loopPrep, prep: loopPrep, d: rand() * loopPrep.length, pos: u.loop[0], heading: 0, caseId: null, onArrive: null, resumeD: 0 });
    });
    // Un móvil arranca en base, como pasaría en un cambio de turno
    const inBase = P.get('MOTO-02');
    inBase.mode = 'base'; inBase.pos = BASE_POS;

    const layer = MT.Map.layers.units;
    P.units.forEach(u => {
      if (MOVING.includes(u.mode)) { const a = G.along(u.prep, u.d); u.pos = a.pos; u.heading = a.heading; }
      u.marker = L.marker(u.pos, {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: '', html: `<div class="unit-marker ${u.kind} st-${u.mode}"><div class="arrow"></div><div class="body">${u.short}</div></div>`, iconSize: [34, 34], iconAnchor: [17, 17] })
      }).bindPopup(() => popup(u), { minWidth: 240 }).bindTooltip(u.name, { direction: 'top', offset: [0, -16] }).addTo(layer);
    });
    map.on('dragstart', () => { P.following = null; });

    let last = performance.now(), acc = 0;
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      P.units.forEach(u => step(u, dt));
      if (P.following) { const u = P.get(P.following); if (u) map.panTo(u.pos, { animate: true, duration: .25 }); }
      acc += dt;
      if (acc > 1) { acc = 0; document.dispatchEvent(new CustomEvent('mt:tick')); }
    }, 250);

    P.renderList();
    document.addEventListener('mt:units', P.renderList);
  };

  function step(u, dt) {
    if (!MOVING.includes(u.mode)) return;
    const sp = (u.mode === 'patrol' ? SPEED.patrol[u.kind] : SPEED.dispatch) * MT.SIM;
    u.d += sp * dt;
    if (u.mode === 'patrol') {
      if (u.d > u.prep.length) u.d -= u.prep.length;
    } else if (u.d >= u.prep.length) {
      u.d = u.prep.length;
      arrive(u);
    }
    const a = G.along(u.prep, u.d);
    u.pos = a.pos;
    if (a.heading || a.heading === 0) u.heading = a.heading;
    updateMarker(u);
  }

  function updateMarker(u) {
    u.marker.setLatLng(u.pos);
    const el = u.marker.getElement();
    if (!el) return;
    const box = el.firstElementChild;
    const cls = `unit-marker ${u.kind} st-${u.mode === 'assigning' ? 'dispatch' : u.mode}`;
    if (box.className !== cls) box.className = cls;
    box.firstElementChild.style.transform = `rotate(${u.heading}deg)`;
  }

  function emit() { document.dispatchEvent(new CustomEvent('mt:units')); }

  function arrive(u) {
    if (u.mode === 'dispatch') {
      u.mode = 'onscene';
      const cb = u.onArrive; u.onArrive = null;
      if (cb) cb(u);
    } else if (u.mode === 'return') {
      if (u.toBase) { u.toBase = false; u.mode = 'base'; }
      else { u.mode = 'patrol'; u.prep = u.loopPrep; u.d = u.resumeD; }
    }
    updateMarker(u);
    emit();
  }

  /* ---------- Despacho ---------- */
  P.nearest = function (target) {
    return P.available().map(u => {
      const dist = G.dist(u.pos, target);
      return { unit: u, dist, eta: dist * 1.35 / SPEED.dispatch };
    }).sort((a, b) => a.dist - b.dist);
  };

  P.dispatch = async function (unitId, target, caseId, onArrive) {
    const u = P.get(unitId);
    u.mode = 'assigning'; u.caseId = caseId; u.onArrive = onArrive;
    updateMarker(u); emit();
    const route = await MT.Routing.get([u.pos, target]);
    if (u.mode !== 'assigning' || u.caseId !== caseId) return null; // reasignado mientras calculaba
    u.prep = G.prepare(route.path); u.d = 0; u.mode = 'dispatch';
    updateMarker(u); emit();
    return route;
  };

  P.remaining = function (u) { return u.mode === 'dispatch' ? Math.max(0, u.prep.length - u.d) : 0; };

  // Libera el móvil y lo devuelve al punto más cercano de su recorrido
  P.release = async function (unitId) {
    const u = P.get(unitId);
    if (!u) return;
    u.caseId = null; u.onArrive = null; u.toBase = false;
    u.mode = 'hold'; updateMarker(u); emit();
    const idx = G.nearestIndex(u.pos, u.loopPrep.path);
    const target = u.loopPrep.path[idx];
    u.resumeD = u.loopPrep.cum[idx];
    const route = await MT.Routing.get([u.pos, target]);
    if (u.mode !== 'hold') return;
    u.prep = G.prepare(route.path); u.d = 0; u.mode = 'return';
    emit();
  };

  P.sendToBase = async function (unitId) {
    const u = P.get(unitId);
    u.mode = 'hold'; u.caseId = null; emit();
    const route = await MT.Routing.get([u.pos, BASE_POS]);
    if (u.mode !== 'hold') return;
    u.prep = G.prepare(route.path); u.d = 0; u.mode = 'return'; u.toBase = true;
    emit();
  };

  P.setOutOfService = function (unitId) {
    const u = P.get(unitId);
    u.mode = 'oos'; u.caseId = null; updateMarker(u); emit();
  };

  P.setLoop = function (unitId, path) {
    const u = P.get(unitId);
    u.loopPrep = G.prepare(path);
    if (['patrol', 'return', 'hold'].includes(u.mode)) P.release(unitId);
    else if (u.mode === 'base') P.release(unitId);
  };

  P.follow = function (unitId) {
    const u = P.get(unitId);
    P.following = unitId;
    MT.Map.focus(u.pos, 17);
  };

  /* ---------- Vistas ---------- */
  function popup(u) {
    const c = u.caseId && MT.SOS.get(u.caseId);
    const el = MT.h(`<div class="pop"><h4>${icon('car', 15)} ${esc(u.name)}</h4>
      <div class="muted" style="font-size:11.5px">${esc(u.org)} · ${esc(u.plate)}</div>
      <div class="kv"><span>Estado</span><span>${P.statusTag(u)}</span>
      <span>A cargo</span><span>${u.agents.map(esc).join(', ')}</span>
      <span>Turno</span><span>${u.shift}</span>
      <span>Velocidad</span><span class="mono">${P.speedKmh(u)} km/h</span>
      ${c ? `<span>Caso</span><span>${c.id} · ${esc(c.typeLabel)}</span>` : ''}
      <span>Último GPS</span><span class="mono">${fmt.time(Date.now(), true)}</span></div>
      <div class="acts"><button class="btn btn-xs" data-f>${icon('crosshair', 13)} Seguir</button></div></div>`);
    el.querySelector('[data-f]').onclick = () => { P.follow(u.id); MT.Map.map.closePopup(); };
    return el;
  }

  P.renderList = function () {
    const el = $('#rp-moviles');
    if (!el) return;
    const active = P.units.filter(u => u.mode !== 'oos' && u.mode !== 'base').length;
    const lc = $('#lc-units'); if (lc) lc.textContent = `${active}/${P.units.length}`;
    el.innerHTML = `<div class="note note-info" style="margin-bottom:10px">${icon('info', 15)}<span>Posiciones simuladas. En producción se reciben del GPS de cada móvil (AVL) cada 5–10 s.</span></div>
      <div class="feed">${P.units.map(u => {
        const c = u.caseId && MT.SOS.get(u.caseId);
        return `<div class="feed-item">
          <div class="ttl"><span>${esc(u.name)}</span>${P.statusTag(u)}</div>
          <div class="meta"><span>${esc(u.agents.join(' · '))}</span><span>Turno ${u.shift}</span>${c ? `<span>Caso ${c.id}</span>` : ''}</div>
          <div class="acts"><button class="btn btn-xs" data-loc="${u.id}">${icon('pin', 13)} Ubicar</button><button class="btn btn-xs" data-fol="${u.id}">${icon('crosshair', 13)} Seguir</button></div>
        </div>`;
      }).join('')}</div>`;
    el.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { P.following = null; MT.Map.focus(P.get(b.dataset.loc).pos, 17); });
    el.querySelectorAll('[data-fol]').forEach(b => b.onclick = () => P.follow(b.dataset.fol));
  };
})(window.MT);
