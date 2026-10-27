/* Cámaras: marcadores en el mapa, cobertura, visor "en vivo" simulado (canvas tipo CCTV) y mosaico. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;

  const C = MT.Cameras = { cams: D.CAMERAS, markers: {}, feeds: new Set() };
  C.get = id => C.cams.find(c => c.id === id);
  const hash = s => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const isNight = () => { const h = new Date().getHours(); return h < 7 || h >= 20; };

  /* =================== Escena simulada =================== */
  class Feed {
    constructor(canvas, cam, { small = false } = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.cam = cam; this.small = small;
      this.W = canvas.width; this.H = canvas.height;
      this.rand = MT.seeded(hash(cam.id));
      this.pan = 0;
      this.entities = [];
      this.alert = null;
      this.build();
      for (let i = 0; i < 4; i++) this.spawn(true);
      this.t0 = performance.now();
    }
    build() {
      const r = MT.seeded(hash(this.cam.id) + 1);
      const { W, H } = this;
      this.night = isNight();
      this.hz = H * (0.34 + r() * 0.1);
      this.vpX = W * (0.38 + r() * 0.24) + this.pan * W * 0.25;
      this.roadW = W * (0.95 + r() * 0.35);
      this.wallH = H * (0.55 + r() * 0.25);
      this.palette = ['#7d6e63', '#8c8f94', '#a39074', '#6b7a83', '#9a8478', '#7f8a75'].map(c => c);
      this.segs = [];
      let z = 0.02;
      while (z < 1.4) { const len = 0.06 + r() * 0.14; this.segs.push({ z0: z, z1: z + len, col: this.palette[Math.floor(r() * 6)], win: r() < .75, lit: r() < .35, door: r() < .4 }); z += len + 0.004; }
      this.lights = [0.15, 0.4, 0.75, 1.1].map(z => ({ z, side: r() < .5 ? -1 : 1 }));
      this.bg = this.renderBg();
      this.overlay = this.renderOverlay();
    }
    // Proyección: z=0 horizonte, z=1 borde inferior; l=-1..1 calzada, |l|>1 vereda
    P(z, l) {
      const { W, H, hz, vpX, roadW } = this;
      const hw = 6 + (roadW / 2 - 6) * z;
      const cx = vpX + (W / 2 - vpX) * z;
      return [cx + l * hw, hz + (H - hz) * z, 0.04 + z * 0.96];
    }
    poly(ctx, pts, fill) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    renderBg() {
      const { W, H, hz, night } = this;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const sky = g.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, night ? '#04060b' : '#8fa5bb'); sky.addColorStop(1, night ? '#111827' : '#c8d3dd');
      g.fillStyle = sky; g.fillRect(0, 0, W, hz + 2);
      g.fillStyle = night ? '#0b0e14' : '#5d6b5a'; g.fillRect(0, hz - 6, W, 8); // árboles lejanos
      // Calzada y veredas
      this.poly(g, [this.P(0, -1.5), this.P(0, 1.5), this.P(1.4, 1.5), this.P(1.4, -1.5)], night ? '#1a1c20' : '#8d8a83');
      this.poly(g, [this.P(0, -1), this.P(0, 1), this.P(1.4, 1), this.P(1.4, -1)], night ? '#101215' : '#4b4d52');
      g.strokeStyle = night ? '#4a4a3a' : '#d8d2b0'; g.lineWidth = 2;
      for (let z = 0.05; z < 1.3; z += 0.13) { // línea central discontinua
        const a = this.P(z, 0), b = this.P(z + 0.05, 0);
        g.lineWidth = Math.max(1, 3 * a[2]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      // Frentes de casas a ambos lados
      [-1, 1].forEach(side => {
        this.segs.forEach(s => {
          const b0 = this.P(s.z0, 1.5 * side), b1 = this.P(s.z1, 1.5 * side);
          const h0 = this.wallH * b0[2] * 0.55, h1 = this.wallH * b1[2] * 0.55;
          this.poly(g, [b0, b1, [b1[0], b1[1] - h1], [b0[0], b0[1] - h0]], night ? '#14161b' : s.col);
          const q = (fz, fh) => { const p = this.P(s.z0 + (s.z1 - s.z0) * fz, 1.5 * side); return [p[0], p[1] - this.wallH * p[2] * 0.55 * fh]; };
          if (s.win) this.poly(g, [q(.25, .45), q(.6, .45), q(.6, .75), q(.25, .75)], night ? (s.lit ? '#e8c46a' : '#090a0d') : '#33404d');
          if (s.door) this.poly(g, [q(.7, 0), q(.88, 0), q(.88, .6), q(.7, .6)], night ? '#07080a' : '#3b2f27');
        });
      });
      // Postes de luz
      this.lights.forEach(L => {
        const p = this.P(L.z, 1.2 * L.side);
        const top = [p[0], p[1] - this.wallH * p[2] * 0.95];
        g.strokeStyle = night ? '#2a2d33' : '#3d4147'; g.lineWidth = Math.max(1, 4 * p[2]);
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(top[0], top[1]); g.stroke();
        if (night) {
          const rg = g.createRadialGradient(top[0], top[1], 1, top[0], top[1], 140 * p[2] + 20);
          rg.addColorStop(0, 'rgba(255,214,140,.55)'); rg.addColorStop(1, 'rgba(255,214,140,0)');
          g.fillStyle = rg; g.fillRect(top[0] - 200, top[1] - 200, 400, 400 + this.H);
        }
      });
      return cv;
    }
    renderOverlay() {
      const { W, H } = this;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
      return cv;
    }
    spawn(initial, forced) {
      const r = this.rand;
      const kind = forced || MT.pickWeighted(r, { persona: 5, auto: 3, moto: 2 });
      const dir = r() < .5 ? 1 : -1; // 1 = se acerca a la cámara
      const e = { kind, dir, z: initial ? r() * 1.05 : (dir > 0 ? -0.02 : 1.12), phase: r() * 10, color: ['#1f2937', '#3f3f46', '#7f1d1d', '#1e3a8a', '#e5e7eb', '#6b7280', '#14532d'][Math.floor(r() * 7)] };
      if (kind === 'persona') { e.l = (r() < .5 ? -1 : 1) * (1.12 + r() * 0.25); e.v = 0.025 + r() * 0.03; }
      else if (kind === 'auto') { e.l = dir > 0 ? -0.5 : 0.5; e.v = 0.09 + r() * 0.08; }
      else { e.l = dir > 0 ? -0.6 : 0.6; e.v = 0.1 + r() * 0.08; }
      this.entities.push(e);
      return e;
    }
    setAlert(alert) {
      this.alert = alert;
      if (!alert) { this.entities.forEach(e => { e.target = false; }); return; }
      const kind = alert.entity || 'persona';
      const e = this.spawn(true, kind);
      e.z = 0.5 + this.rand() * 0.2; e.target = true; e.v = kind === 'persona' ? 0.004 : 0; e.dir = 1;
      if (kind !== 'persona') e.l = 1.0 * (this.rand() < .5 ? -1 : 1) * 0.85;
    }
    update(dt) {
      this.entities.forEach(e => { e.z += e.v * e.dir * dt; e.phase += dt * (e.kind === 'persona' ? 6 : 0); });
      this.entities = this.entities.filter(e => e.target || (e.z > -0.05 && e.z < 1.18));
      const max = this.small ? 4 : 6;
      if (this.entities.length < max && this.rand() < dt * 0.6) this.spawn(false);
    }
    drawEntity(g, e) {
      if (e.z < 0.02) return null; // todavía en el horizonte
      const [x, y, s] = this.P(e.z, e.l);
      const H = this.H;
      if (e.kind === 'persona') {
        const h = H * 0.42 * s, w = h * 0.26;
        const sw = Math.sin(e.phase) * w * 0.35 * (e.v > 0.01 ? 1 : 0.15);
        g.fillStyle = this.night ? '#2b2b2b' : '#22252b';
        g.fillRect(x - w * 0.35 + sw, y - h * 0.45, w * 0.3, h * 0.45);
        g.fillRect(x + w * 0.05 - sw, y - h * 0.45, w * 0.3, h * 0.45);
        g.fillStyle = this.night ? '#3a3a3a' : e.color;
        g.fillRect(x - w / 2, y - h * 0.85, w, h * 0.44);
        g.beginPath(); g.arc(x, y - h * 0.92, h * 0.09, 0, Math.PI * 2); g.fillStyle = this.night ? '#555' : '#c8a27c'; g.fill();
        return [x - w * 0.7, y - h * 1.03, w * 1.4, h * 1.05];
      }
      const hw = (6 + (this.roadW / 2 - 6) * e.z);
      const w = e.kind === 'auto' ? hw * 0.7 : hw * 0.22, h = e.kind === 'auto' ? w * 0.62 : w * 1.5;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - w / 2, y - h * 0.08, w, h * 0.12);
      g.fillStyle = this.night ? '#2a2a2a' : e.color;
      g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - h, w, h, w * 0.08) : g.rect(x - w / 2, y - h, w, h); g.fill();
      if (e.kind === 'auto') { g.fillStyle = this.night ? '#111' : '#2a3a4a'; g.fillRect(x - w * 0.38, y - h * 0.92, w * 0.76, h * 0.32); }
      const lightCol = e.dir > 0 ? (this.night ? '#fffbe6' : '#f5f0d0') : '#ff2a2a';
      g.fillStyle = lightCol;
      if (e.kind === 'auto') { g.fillRect(x - w * 0.45, y - h * 0.42, w * 0.14, h * 0.1); g.fillRect(x + w * 0.31, y - h * 0.42, w * 0.14, h * 0.1); }
      else g.fillRect(x - w * 0.15, y - h * 0.62, w * 0.3, h * 0.08);
      if (this.night && e.dir > 0) {
        const rg = g.createRadialGradient(x, y - h * 0.4, 1, x, y - h * 0.4, w * 1.4);
        rg.addColorStop(0, 'rgba(255,250,220,.5)'); rg.addColorStop(1, 'rgba(255,250,220,0)');
        g.fillStyle = rg; g.fillRect(x - w * 1.5, y - h * 1.6, w * 3, h * 3);
      }
      return [x - w * 0.6, y - h * 1.1, w * 1.2, h * 1.2];
    }
    draw(now) {
      const g = this.ctx, { W, H } = this;
      const dt = Math.min(0.2, (now - (this.last || now)) / 1000);
      this.last = now;
      if (this.cam.status === 'offline') return this.drawOffline(g);
      if (isNight() !== this.night) this.build();
      this.update(dt);
      g.drawImage(this.bg, 0, 0);
      const boxes = [];
      this.entities.sort((a, b) => a.z - b.z).forEach(e => { const box = this.drawEntity(g, e); if (e.target && box) boxes.push(box); });
      if (this.night) { g.globalCompositeOperation = 'saturation'; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(40,60,40,.12)'; g.fillRect(0, 0, W, H); }
      // Ruido de sensor
      for (let i = 0; i < (this.small ? 40 : 160); i++) { g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.15)'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      g.drawImage(this.overlay, 0, 0);
      boxes.forEach(b => this.drawBox(g, b));
      this.drawOSD(g, now);
    }
    drawBox(g, [x, y, w, h]) {
      const a = this.alert;
      const col = '#c4b5fd';
      g.strokeStyle = col; g.lineWidth = this.small ? 1.5 : 2.5;
      const c = Math.min(w, h) * 0.25;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, sx, sy]) => {
        g.beginPath(); g.moveTo(px, py + c * sy); g.lineTo(px, py); g.lineTo(px + c * sx, py); g.stroke();
      });
      g.globalAlpha = .25; g.strokeRect(x, y, w, h); g.globalAlpha = 1;
      if (a) {
        const fs = this.small ? 9 : 14;
        const label = `${(a.entityLabel || 'PERSONA').toUpperCase()} ${Math.round(a.confidence * 100)}%`;
        g.font = `600 ${fs}px JetBrains Mono, monospace`;
        const tw = g.measureText(label).width + 10;
        g.fillStyle = 'rgba(76,29,149,.9)'; g.fillRect(x, y - fs - 8, tw, fs + 6);
        g.fillStyle = '#fff'; g.fillText(label, x + 5, y - 7);
      }
    }
    drawOSD(g, now) {
      const { W, H, small } = this;
      const fs = small ? 10 : 16;
      g.font = `600 ${fs}px JetBrains Mono, monospace`;
      g.textBaseline = 'alphabetic';
      const txt = (s, x, y, align = 'left') => { g.textAlign = align; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(s, x + 1, y + 1); g.fillStyle = '#f1f5f9'; g.fillText(s, x, y); };
      const d = new Date();
      txt(`${this.cam.id}  ${small ? '' : this.cam.name.toUpperCase()}`, 10, fs + 8);
      txt(`${fmt.date(d).replace(/\//g, '-')} ${fmt.time(d, true)}`, W - 10, fs + 8, 'right');
      if (Math.floor(now / 600) % 2) { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(14, H - fs * 0.75 - 6, fs * 0.38, 0, 7); g.fill(); }
      txt('REC', 14 + fs * 0.7, H - 8);
      if (!small) txt(`${this.night ? 'IR · ' : ''}1920x1080 · 15 FPS · H.265`, W - 10, H - 10, 'right');
      g.textAlign = 'left';
    }
    drawOffline(g) {
      const { W, H } = this;
      const id = g.createImageData(W, H);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 90; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      g.putImageData(id, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, H / 2 - 30, W, 60);
      g.fillStyle = '#f87171'; g.font = `700 ${this.small ? 14 : 24}px JetBrains Mono, monospace`; g.textAlign = 'center';
      g.fillText('SIN SEÑAL', W / 2, H / 2 + (this.small ? 5 : 2));
      g.fillStyle = '#cbd5e1'; g.font = `500 ${this.small ? 9 : 13}px JetBrains Mono, monospace`;
      g.fillText(`${this.cam.id} · último video hace 3 h 12 min`, W / 2, H / 2 + (this.small ? 19 : 22));
      g.textAlign = 'left';
    }
  }

  // Un solo bucle de animación para todas las cámaras visibles
  let lastFrame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - lastFrame < 66) return; // ~15 fps
    lastFrame = now;
    C.feeds.forEach(f => {
      if (!f.c.isConnected) { C.feeds.delete(f); return; }
      if (f.c.offsetParent === null) return;
      if (f.small && f.cam.status === 'offline' && Math.random() < .6) return;
      f.draw(now);
    });
  }

  C.attach = function (canvas, cam, opts) {
    const f = new Feed(canvas, cam, opts);
    const alert = MT.Alerts && MT.Alerts.activeFor(cam.id);
    if (alert) f.setAlert(alert);
    C.feeds.add(f);
    f.draw(performance.now());
    return f;
  };
  C.notifyAlert = function (camId, alert) {
    C.feeds.forEach(f => { if (f.cam.id === camId) f.setAlert(alert); });
    C.refreshMarker(camId);
    $$(`.cam-tile[data-cam="${camId}"]`).forEach(t => t.classList.toggle('alerting', !!alert));
  };

  /* =================== Mapa =================== */
  function camIcon(cam) {
    const alerting = MT.Alerts && MT.Alerts.activeFor(cam.id);
    return L.divIcon({ className: '', html: `<div class="cam-marker ${cam.status} ${alerting ? 'alerting' : ''}">${icon('video', 15)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  C.refreshMarker = id => { const m = C.markers[id]; if (m) m.setIcon(camIcon(C.get(id))); };

  C.init = function () {
    const layer = MT.Map.layers.cameras, cov = MT.Map.layers.coverage;
    C.cams.forEach(cam => {
      C.markers[cam.id] = L.marker(cam.pos, { icon: camIcon(cam), zIndexOffset: 500 })
        .bindTooltip(`${cam.id} · ${esc(cam.name)}${cam.status === 'offline' ? ' (fuera de línea)' : ''}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => C.open(cam.id)).addTo(layer);
      L.circle(cam.pos, { radius: cam.range, color: cam.status === 'online' ? '#22d3ee' : '#64748b', weight: 1, fillOpacity: .12, dashArray: cam.status === 'online' ? null : '4 4' }).addTo(cov);
    });
    const online = C.cams.filter(c => c.status === 'online').length;
    $('#lc-cameras').textContent = `${online}/${C.cams.length}`;
    requestAnimationFrame(loop);
  };

  /* =================== Visor =================== */
  C.open = function (id) {
    const cam = C.get(id);
    const alerts = MT.Alerts.forCamera(id);
    const ptz = cam.kind === 'Domo PTZ' && cam.status === 'online';
    const m = MT.modal({
      title: `${icon('video', 18)} ${cam.id} · ${esc(cam.name)} ${cam.status === 'online' ? '<span class="tag tag-ok"><i class="dot dot-live"></i> En vivo</span>' : '<span class="tag tag-danger">Fuera de línea</span>'}`,
      wide: true,
      body: `<div class="cam-view">
        <div class="stack">
          <div class="cam-screen"><canvas width="960" height="540"></canvas></div>
          <div class="note">${icon('info', 15)}<span><b>Imagen simulada para la demo.</b> En producción el visor reproduce el video real del grabador (NVR/DVR) convertido de RTSP a WebRTC/HLS, con 1–3 s de demora.</span></div>
        </div>
        <div class="cam-side">
          <div class="card card-body" style="padding:12px 14px"><div class="pop"><div class="kv" style="margin:0">
            <span>Tipo</span><span>${cam.kind}${cam.kind === 'LPR' ? ' (lectura de patentes)' : ''}</span>
            <span>Ubicación</span><span>${esc(D.address(cam.pos[0], cam.pos[1]))}</span>
            <span>Zona</span><span>${esc(D.ZONES[D.zoneOf(cam.pos[0], cam.pos[1])].name)}</span>
            <span>Alcance útil</span><span>~${cam.range} m</span>
            <span>Grabación</span><span>${cam.status === 'online' ? 'Continua · 30 días' : '—'}</span>
            <span>Incid. cerca (año)</span><span>${D.incidents().filter(i => MT.Geo.dist([i.lat, i.lng], cam.pos) <= cam.range).length}</span>
          </div></div></div>
          ${ptz ? `<div><div class="muted" style="font-size:12px;margin-bottom:6px">Control PTZ</div><div class="row"><button class="btn btn-sm" data-pan="-1">◀ Girar</button><button class="btn btn-sm" data-pan="1">Girar ▶</button></div></div>` : ''}
          <div><div class="muted" style="font-size:12px;margin-bottom:6px">Alertas de esta cámara</div>
            <div class="feed" id="cam-alerts">${alerts.length ? alerts.slice(0, 5).map(a => `<div class="feed-item lvl-${a.level} ${a.status !== 'activa' ? 'done' : ''}"><div class="ttl"><span>${esc(a.label)}</span></div><div class="meta"><span>${fmt.time(a.t)}</span><span>${Math.round(a.confidence * 100)}%</span><span>${MT.Alerts.statusLabel(a)}</span></div></div>`).join('') : '<div class="empty">Sin alertas recientes</div>'}</div></div>
          <div class="row row-wrap">
            <button class="btn btn-sm" data-map>${icon('pin', 14)} Ver en mapa</button>
            ${cam.status === 'online' ? `<button class="btn btn-sm" data-shot>${icon('camera', 14)} Captura</button>` : ''}
          </div>
        </div></div>`
    });
    const canvas = m.body.querySelector('canvas');
    const feed = C.attach(canvas, cam);
    m.body.querySelectorAll('[data-pan]').forEach(b => b.onclick = () => {
      feed.pan = Math.max(-1, Math.min(1, feed.pan + Number(b.dataset.pan) * 0.5));
      feed.build();
    });
    const mapBtn = m.body.querySelector('[data-map]');
    mapBtn.onclick = () => { m.close(); MT.Map.focus(cam.pos, 18); };
    const shot = m.body.querySelector('[data-shot]');
    if (shot) shot.onclick = () => {
      const a = document.createElement('a');
      a.download = `${cam.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      MT.toast({ title: 'Captura guardada', msg: 'La imagen queda como evidencia asociada a la cámara.', level: 'ok' });
    };
    return m;
  };

  /* =================== Mosaico =================== */
  let gridInit = false;
  C.renderGrid = function () {
    const sec = $('#sec-camaras');
    if (!gridInit) {
      gridInit = true;
      sec.innerHTML = `<div class="page">
        <div class="page-head"><div><h2>Cámaras de la ciudad</h2><p>${C.cams.length} cámaras municipales. Hacé clic en una para verla en grande, controlar el domo o revisar sus alertas.</p></div>
          <div class="toolbar">
            <div class="seg" id="cam-filter"><button data-v="all" class="active">Todas</button><button data-v="alert">Con alerta</button><button data-v="offline">Fuera de línea</button></div>
            <div class="seg" id="cam-cols"><button data-v="2">2×2</button><button data-v="3" class="active">3×3</button><button data-v="4">4×4</button></div>
          </div></div>
        <div class="note">${icon('info', 15)}<span>Video simulado. Para conectar las cámaras reales hace falta: acceso a los grabadores existentes, enlace de datos estable (fibra o radioenlace) y un servidor de video en el Centro de Monitoreo.</span></div>
        <div class="cam-grid" id="cam-grid"></div></div>`;
      $$('#cam-cols button').forEach(b => b.onclick = () => {
        $$('#cam-cols button').forEach(x => x.classList.toggle('active', x === b));
        $('#cam-grid').style.setProperty('--cols', b.dataset.v);
      });
      $$('#cam-filter button').forEach(b => b.onclick = () => {
        $$('#cam-filter button').forEach(x => x.classList.toggle('active', x === b));
        C.gridFilter = b.dataset.v; C.renderGrid();
      });
    }
    const f = C.gridFilter || 'all';
    const list = C.cams.filter(c => f === 'all' || (f === 'offline' ? c.status === 'offline' : !!MT.Alerts.activeFor(c.id)));
    const grid = $('#cam-grid');
    grid.innerHTML = list.length ? '' : '<div class="empty" style="grid-column:1/-1">No hay cámaras en esta categoría.</div>';
    list.forEach(cam => {
      const alerting = MT.Alerts.activeFor(cam.id);
      const tile = MT.h(`<div class="cam-tile ${alerting ? 'alerting' : ''}" data-cam="${cam.id}"><canvas width="480" height="270"></canvas>
        <div class="lbl"><span>${esc(cam.name)}</span>${cam.status === 'online' ? (alerting ? '<span class="tag tag-violet">Alerta IA</span>' : '<span class="tag tag-ok">En vivo</span>') : '<span class="tag tag-danger">Sin señal</span>'}</div></div>`);
      tile.onclick = () => C.open(cam.id);
      grid.appendChild(tile);
      C.attach(tile.querySelector('canvas'), cam, { small: true });
    });
  };
})(window.MT);
