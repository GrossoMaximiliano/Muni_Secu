/* Utilidades compartidas: almacenamiento, geometría, formato, UI (toasts, modales, sonido), íconos y ruteo. */
window.MT = window.MT || {};

(function (MT) {
  'use strict';

  /* ---------- Almacenamiento (localStorage con respaldo en memoria) ---------- */
  const mem = {};
  MT.Store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('mt_' + key);
        if (v !== null) return JSON.parse(v);
      } catch (e) { /* storage no disponible */ }
      return key in mem ? mem[key] : def;
    },
    set(key, val) {
      mem[key] = val;
      try { localStorage.setItem('mt_' + key, JSON.stringify(val)); } catch (e) { /* ignorar */ }
    },
    del(key) {
      delete mem[key];
      try { localStorage.removeItem('mt_' + key); } catch (e) { /* ignorar */ }
    }
  };

  /* ---------- Aleatorio con semilla (resultados repetibles en la demo) ---------- */
  MT.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  MT.pickWeighted = function (rand, weights) {
    // weights: objeto {clave: peso} o array de pesos (devuelve índice)
    const keys = Array.isArray(weights) ? weights.map((_, i) => i) : Object.keys(weights);
    const vals = Array.isArray(weights) ? weights : keys.map(k => weights[k]);
    const total = vals.reduce((s, v) => s + v, 0);
    let r = rand() * total;
    for (let i = 0; i < keys.length; i++) { r -= vals[i]; if (r <= 0) return keys[i]; }
    return keys[keys.length - 1];
  };
  MT.gauss = function (rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /* ---------- Geometría ---------- */
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  MT.Geo = {
    dist(a, b) { // a, b = [lat, lng] → metros
      const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    },
    pathLength(path) {
      let d = 0;
      for (let i = 1; i < path.length; i++) d += MT.Geo.dist(path[i - 1], path[i]);
      return d;
    },
    bearing(a, b) {
      const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
      const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    },
    // Precalcula distancias acumuladas para recorrer un camino rápidamente
    prepare(path) {
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + MT.Geo.dist(path[i - 1], path[i]));
      return { path, cum, length: cum[cum.length - 1] };
    },
    along(prep, d) { // posición y rumbo a d metros del inicio
      const { path, cum, length } = prep;
      if (path.length === 1 || length === 0) return { pos: path[0], heading: 0 };
      d = Math.max(0, Math.min(d, length));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const f = (d - cum[i - 1]) / seg;
      const a = path[i - 1], b = path[i];
      return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: MT.Geo.bearing(a, b) };
    },
    // Proyección local plana (metros) para cálculos de cercanía
    toXY(p, ref) {
      return [(p[1] - ref[1]) * Math.cos(toRad(ref[0])) * 111320, (p[0] - ref[0]) * 110540];
    },
    distToPath(p, path) {
      const ref = path[0];
      const P = MT.Geo.toXY(p, ref);
      let best = Infinity;
      for (let i = 1; i < path.length; i++) {
        const A = MT.Geo.toXY(path[i - 1], ref), B = MT.Geo.toXY(path[i], ref);
        const dx = B[0] - A[0], dy = B[1] - A[1];
        const len2 = dx * dx + dy * dy || 1;
        let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const x = A[0] + t * dx - P[0], y = A[1] + t * dy - P[1];
        best = Math.min(best, Math.sqrt(x * x + y * y));
      }
      return path.length === 1 ? MT.Geo.dist(p, path[0]) : best;
    },
    nearestIndex(p, path) {
      let bi = 0, bd = Infinity;
      path.forEach((q, i) => { const d = MT.Geo.dist(p, q); if (d < bd) { bd = d; bi = i; } });
      return bi;
    }
  };

  /* ---------- Formato ---------- */
  const pad = n => String(n).padStart(2, '0');
  MT.fmt = {
    date(t) { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
    time(t, secs) { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}${secs ? ':' + pad(d.getSeconds()) : ''}`; },
    dateTime(t) { return MT.fmt.date(t) + ' ' + MT.fmt.time(t); },
    ago(t) {
      const s = Math.round((Date.now() - t) / 1000);
      if (s < 60) return `hace ${Math.max(s, 1)} s`;
      if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
      if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
      return `hace ${Math.floor(s / 86400)} d`;
    },
    dist(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`; },
    dur(sec) {
      sec = Math.max(0, Math.round(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return m ? `${m} min ${pad(s)} s` : `${s} s`;
    },
    num(n) { return Number(n).toLocaleString('es-AR'); },
    pct(n, digits = 0) { return `${(n * 100).toFixed(digits).replace('.', ',')}%`; },
    hourRange(a, b) { return `${pad(a)}–${pad(b % 24)} h`; }
  };

  MT.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  MT.$ = (sel, root = document) => root.querySelector(sel);
  MT.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  MT.h = function (html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  /* ---------- Íconos (trazos estilo Feather/Lucide, MIT) ---------- */
  const ICONS = {
    map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5v5z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><line x1="5" y1="12" x2="19" y2="12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>'
  };
  MT.icon = function (name, size = 18, cls = '') {
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  };

  /* ---------- Sonido (WebAudio, sin archivos) ---------- */
  let audioCtx = null;
  MT.isMuted = () => MT.Store.get('muted', false);
  MT.beep = function (kind = 'alert') {
    if (MT.isMuted()) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = {
        alert: [[880, 0, .12], [660, .15, .12]],
        sos: [[980, 0, .14], [740, .17, .14], [980, .34, .14], [740, .51, .14]],
        ok: [[660, 0, .1], [990, .12, .14]],
        info: [[720, 0, .1]]
      }[kind] || [[700, 0, .1]];
      const t0 = audioCtx.currentTime;
      seq.forEach(([f, start, dur]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
      });
    } catch (e) { /* sin audio */ }
  };

  /* ---------- Toasts ---------- */
  MT.toast = function ({ title, msg = '', level = 'info', icon, actions = [], timeout = 7000 }) {
    let wrap = MT.$('#toasts');
    if (!wrap) { wrap = MT.h('<div id="toasts" class="toasts" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const ic = icon || { info: 'info', ok: 'check', warn: 'alert', danger: 'alert', ia: 'cpu', sos: 'radio' }[level] || 'info';
    const el = MT.h(`<div class="toast toast-${level}">
      <div class="toast-ic">${MT.icon(ic, 18)}</div>
      <div class="toast-body"><strong>${MT.esc(title)}</strong>${msg ? `<p>${msg}</p>` : ''}<div class="toast-actions"></div></div>
      <button class="toast-x" aria-label="Cerrar">${MT.icon('x', 14)}</button></div>`);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
    actions.forEach(a => {
      const b = MT.h(`<button class="btn btn-xs ${a.primary ? 'btn-primary' : ''}">${MT.esc(a.label)}</button>`);
      b.onclick = () => { a.fn(); close(); };
      el.querySelector('.toast-actions').appendChild(b);
    });
    el.querySelector('.toast-x').onclick = close;
    wrap.prepend(el);
    while (wrap.children.length > 4) wrap.lastElementChild.remove();
    if (timeout) setTimeout(close, timeout);
    return { close };
  };

  /* ---------- Modales ---------- */
  MT.modal = function ({ title, body, wide = false, cls = '', onClose }) {
    const el = MT.h(`<div class="modal-back"><div class="modal ${wide ? 'modal-wide' : ''} ${cls}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="icon-btn modal-x" aria-label="Cerrar">${MT.icon('x', 18)}</button></div>
      <div class="modal-body"></div></div></div>`);
    const bodyEl = el.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      el.classList.add('out');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), 200);
      if (onClose) onClose();
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    el.querySelector('.modal-x').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    return { el, body: bodyEl, close };
  };

  /* ---------- Ruteo por calles (OSRM público con respaldo aproximado) ---------- */
  const routeCache = {};
  MT.Routing = {
    online: null, // null = sin probar, true/false según último intento
    async get(points) { // points: [[lat,lng], ...] → {path, distance, source}
      const key = points.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';');
      if (routeCache[key]) return routeCache[key];
      let result = null;
      if (MT.Routing.online !== false) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const coords = points.map(p => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ctrl.signal });
          clearTimeout(timer);
          const data = await res.json();
          if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const path = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            // Une el punto exacto de inicio y fin a la calle
            path.unshift(points[0]); path.push(points[points.length - 1]);
            result = { path, distance: MT.Geo.pathLength(path), source: 'osrm' };
            MT.Routing.online = true;
          }
        } catch (e) { MT.Routing.online = false; }
      }
      if (!result) result = MT.Routing.approx(points);
      routeCache[key] = result;
      return result;
    },
    // Ruta aproximada siguiendo la grilla (primero en un eje, después en el otro)
    approx(points) {
      const path = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        path.push([a[0], b[1]], b);
      }
      return { path, distance: MT.Geo.pathLength(path), source: 'aprox' };
    }
  };

  /* ---------- Simulación ---------- */
  MT.SIM = 4; // la demo corre 4 veces más rápido que la realidad
})(window.MT);
