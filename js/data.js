/* Datos simulados de Las Toscas (Santa Fe).
   La grilla de calles reproduce la numeración real aproximada (impares este-oeste, pares norte-sur, RN11 al oeste).
   Todos los incidentes, móviles, agentes y alertas son FICTICIOS. */
(function (MT) {
  'use strict';

  /* ---------- Grilla urbana ---------- */
  const GRID = { lat0: -28.3618, dLat: 0.000737, lon0: -59.2653, dLon: 0.00098 };
  const calleLat = n => GRID.lat0 + ((n - 1) / 2) * GRID.dLat;        // calles impares (este-oeste)
  const calleLon = n => GRID.lon0 + ((n - 2) / 2) * GRID.dLon;        // calles pares (norte-sur); Calle 2 = RN11
  const inter = (odd, even) => [calleLat(odd), calleLon(even)];
  const westLon = k => GRID.lon0 - k * GRID.dLon;                      // k cuadras al oeste de la RN11

  function address(lat, lng) {
    const r = Math.round((lat - GRID.lat0) / GRID.dLat);
    const c = Math.round((lng - GRID.lon0) / GRID.dLon);
    const odd = Math.max(1, Math.min(49, r * 2 + 1));
    if (Math.abs(lng - GRID.lon0) < 0.00035) return `Ruta Nac. 11 y Calle ${odd}`;
    if (c < 0) return `Calle ${odd + 100} y Calle ${102 - 2 * c}`;
    return `Calle ${odd} y Calle ${Math.min(20, c * 2 + 2)}`;
  }

  const ZONES = {
    centro: { name: 'Centro', color: '#22d3ee' },
    norte: { name: 'Zona Norte', color: '#60a5fa' },
    norte_alto: { name: 'Norte (Bv. 37 en adelante)', color: '#818cf8' },
    este: { name: 'Zona Este', color: '#34d399' },
    sudeste: { name: 'Sudeste / Arroyo', color: '#fbbf24' },
    sur: { name: 'Zona Sur', color: '#f97316' },
    rn11: { name: 'Corredor RN11', color: '#f472b6' },
    oeste: { name: 'Oeste (cruce RN11)', color: '#a78bfa' }
  };
  function zoneOf(lat, lng) {
    const r = (lat - GRID.lat0) / GRID.dLat;
    const c = (lng - GRID.lon0) / GRID.dLon;
    if (c < -0.4) return 'oeste';
    if (c < 0.6) return 'rn11';
    if (r >= 18.5) return 'norte_alto';
    if (c >= 5.5) return r >= 6 ? 'este' : 'sudeste';
    if (r >= 12.5) return 'norte';
    if (r >= 6.5) return 'centro';
    return 'sur';
  }

  /* ---------- Tipos de incidente ---------- */
  const TYPES = {
    vivienda: { label: 'Robo a vivienda', short: 'Vivienda', color: '#f97316' },
    via_publica: { label: 'Robo en vía pública / arrebato', short: 'Vía pública', color: '#ef4444' },
    moto: { label: 'Robo de moto / bicicleta', short: 'Moto / bici', color: '#a855f7' },
    comercio: { label: 'Hurto o robo a comercio', short: 'Comercio', color: '#eab308' },
    vandalismo: { label: 'Vandalismo / daños', short: 'Vandalismo', color: '#3b82f6' },
    otro: { label: 'Amenazas / disturbios / otros', short: 'Otros', color: '#14b8a6' }
  };

  const DESCS = {
    vivienda: ['Ingreso a vivienda por ventana trasera en ausencia de moradores. Faltan electrodomésticos.', 'Forzaron portón y sustrajeron herramientas del galpón.', 'Robo de garrafa y bicicleta del patio delantero.', 'Vecinos escucharon ruidos de madrugada; faltante de dinero y celulares.'],
    via_publica: ['Arrebato de celular a peatón por dos sujetos en moto.', 'Sustracción de cartera a mujer que esperaba el colectivo.', 'Robo de mochila a estudiante a la salida de la escuela.', 'Amenazaron con arma blanca y robaron billetera.'],
    moto: ['Robo de motocicleta 110cc estacionada frente a domicilio.', 'Sustracción de bicicleta sin candado frente a comercio.', 'Moto robada en la vereda durante la noche, sin alarma.'],
    comercio: ['Hurto de mercadería en almacén; el autor huyó a pie.', 'Rotura de vidriera y faltante de caja chica.', 'Robo en kiosco al momento del cierre.'],
    vandalismo: ['Daños a luminaria pública y cartelería.', 'Pintadas y rotura de juegos en plaza.', 'Rotura de vidrios de vehículo estacionado.'],
    otro: ['Disturbios entre grupos a la salida de un evento.', 'Amenazas entre vecinos, intervención de patrulla.', 'Persona sospechosa merodeando viviendas.']
  };
  const SOURCES = ['911', 'Comisaría', 'Vecino', 'Cámara municipal', 'Patrulla'];

  /* ---------- Generación de incidentes del último año ---------- */
  const HOURS = { // peso por hora del día (0..23)
    nocturno: [5, 4, 3, 3, 2, 2, 2, 3, 4, 4, 4, 5, 5, 4, 4, 4, 5, 6, 7, 8, 9, 9, 8, 7],
    comercio: [1, 1, 1, 1, 1, 1, 1, 2, 4, 6, 7, 7, 6, 5, 5, 6, 7, 8, 8, 7, 4, 2, 1, 1],
    vivienda: [6, 7, 7, 6, 5, 3, 2, 2, 3, 4, 5, 5, 6, 6, 6, 5, 4, 4, 4, 4, 4, 5, 5, 6]
  };
  const WEEKDAY = [1.25, 0.9, 0.9, 0.95, 1.0, 1.2, 1.35]; // dom..sáb

  const HOTSPOTS = [
    { center: inter(19, 8), sigma: 120, w: 0.22, trend: 0.1, types: { via_publica: .34, comercio: .3, moto: .16, vivienda: .08, vandalismo: .12 } },
    { center: inter(5, 10), sigma: 150, w: 0.17, trend: 0.9, types: { vivienda: .45, moto: .25, via_publica: .15, otro: .15 } },
    { center: [calleLat(25), westLon(1.2)], sigma: 130, w: 0.13, trend: -0.4, types: { moto: .4, via_publica: .3, vivienda: .2, otro: .1 } },
    { center: inter(33, 12), sigma: 100, w: 0.07, trend: 0.2, types: { vivienda: .5, moto: .3, vandalismo: .2 } }
  ];
  const BACKGROUND_TYPES = { vivienda: .3, via_publica: .2, moto: .2, comercio: .1, vandalismo: .12, otro: .08 };

  function generateIncidents() {
    const rand = MT.seeded(20261027);
    const now = Date.now();
    const DAY = 86400000;
    const N = 720;
    const out = [];
    for (let i = 0; i < N; i++) {
      // Lugar
      let pos, typeW, trend = 0;
      const r = rand();
      let acc = 0, hs = null;
      for (const h of HOTSPOTS) { acc += h.w; if (r < acc) { hs = h; break; } }
      if (hs) {
        const m = 111000;
        pos = [hs.center[0] + MT.gauss(rand) * hs.sigma / m, hs.center[1] + MT.gauss(rand) * hs.sigma / (m * 0.88)];
        typeW = hs.types; trend = hs.trend;
      } else {
        // Fondo: sobre una calle al azar dentro del casco urbano
        if (rand() < 0.12) {
          const odd = 19 + Math.floor(rand() * 9) * 2;
          pos = [calleLat(odd), GRID.lon0 - rand() * 0.003];
        } else if (rand() < 0.5) {
          const odd = 1 + Math.floor(rand() * 25) * 2;
          pos = [calleLat(odd), calleLon(2) + rand() * (calleLon(20) - calleLon(2))];
        } else {
          const even = 2 + Math.floor(rand() * 10) * 2;
          pos = [calleLat(1) + rand() * (calleLat(49) - calleLat(1)), calleLon(even)];
        }
        typeW = BACKGROUND_TYPES;
      }
      const type = MT.pickWeighted(rand, typeW);
      // Fecha: tendencia (positiva = crece hacia el presente)
      let dayOff;
      for (let k = 0; k < 20; k++) {
        dayOff = Math.floor(rand() * 365);
        const recency = 1 - dayOff / 365;
        const w = 1 + trend * (recency - 0.5);
        if (rand() * 1.5 < w) break;
      }
      const hourW = type === 'comercio' ? HOURS.comercio : type === 'vivienda' ? HOURS.vivienda : HOURS.nocturno;
      const hour = MT.pickWeighted(rand, hourW);
      let t = new Date(now - dayOff * DAY);
      t.setHours(hour, Math.floor(rand() * 60), 0, 0);
      // Ajuste por día de semana: reintenta un día vecino si el día es "flojo"
      if (rand() > WEEKDAY[t.getDay()] / 1.35) t = new Date(t.getTime() - DAY * (rand() < .5 ? 1 : -1));
      if (t.getTime() > now) t = new Date(now - rand() * 3 * 3600000);
      const ageDays = (now - t.getTime()) / DAY;
      const status = ageDays > 30 ? (rand() < .9 ? 'cerrado' : 'investigacion') : ageDays > 3 ? (rand() < .55 ? 'investigacion' : 'cerrado') : (rand() < .6 ? 'abierto' : 'investigacion');
      out.push({
        type, lat: pos[0], lng: pos[1], t: t.getTime(),
        status,
        source: SOURCES[MT.pickWeighted(rand, [40, 18, 25, 9, 8])],
        respMin: Math.round(4 + Math.abs(MT.gauss(rand)) * 6 + rand() * 4),
        desc: DESCS[type][Math.floor(rand() * DESCS[type].length)]
      });
    }
    out.sort((a, b) => a.t - b.t);
    const year = new Date().getFullYear();
    out.forEach((inc, i) => {
      inc.id = `INC-${year}-${String(i + 1).padStart(4, '0')}`;
      inc.zone = zoneOf(inc.lat, inc.lng);
      inc.addr = address(inc.lat, inc.lng);
    });
    return out;
  }

  /* ---------- Cámaras ---------- */
  const CAMERAS = [
    { id: 'CAM-01', name: 'Acceso Norte RN11', pos: [calleLat(47), GRID.lon0], kind: 'LPR' },
    { id: 'CAM-02', name: 'Acceso Sur RN11', pos: [calleLat(1), GRID.lon0], kind: 'LPR' },
    { id: 'CAM-03', name: 'RN11 y Calle 21', pos: inter(21, 2), kind: 'Domo PTZ' },
    { id: 'CAM-04', name: 'RN11 y Bulevar 37', pos: inter(37, 2), kind: 'Fija' },
    { id: 'CAM-05', name: 'Centro – Calle 19 y 8', pos: inter(19, 8), kind: 'Domo PTZ' },
    { id: 'CAM-06', name: 'Centro – Calle 21 y 10', pos: inter(21, 10), kind: 'Fija' },
    { id: 'CAM-07', name: 'Centro – Calle 17 y 6', pos: inter(17, 6), kind: 'Fija' },
    { id: 'CAM-08', name: 'Zona bancaria – Calle 23 y 8', pos: inter(23, 8), kind: 'Domo PTZ' },
    { id: 'CAM-09', name: 'Hospital – Calle 35 y 12', pos: inter(35, 12), kind: 'Fija' },
    { id: 'CAM-10', name: 'Escuela – Calle 27 y 6', pos: inter(27, 6), kind: 'Fija' },
    { id: 'CAM-11', name: 'Bulevar 37 y Calle 14', pos: inter(37, 14), kind: 'Fija' },
    { id: 'CAM-12', name: 'Calle 13 y 12', pos: inter(13, 12), kind: 'Fija' },
    { id: 'CAM-13', name: 'Calle 9 y 6', pos: inter(9, 6), kind: 'Fija' },
    { id: 'CAM-14', name: 'Puente arroyo – Calle 7 y 16', pos: inter(7, 16), kind: 'Fija', status: 'offline' },
    { id: 'CAM-15', name: 'Calle 29 y 16', pos: inter(29, 16), kind: 'Fija' },
    { id: 'CAM-16', name: 'Terminal – Calle 25 y 4', pos: inter(25, 4), kind: 'Domo PTZ' },
    { id: 'CAM-17', name: 'Oeste – Calle 125 y 104', pos: [calleLat(25), westLon(1)], kind: 'Fija', status: 'offline' },
    { id: 'CAM-18', name: 'Calle 43 y 10', pos: inter(43, 10), kind: 'Fija' },
    { id: 'CAM-19', name: 'Calle 3 y 4', pos: inter(3, 4), kind: 'Fija' }
  ].map(c => Object.assign({ status: 'online', range: c.kind === 'Domo PTZ' ? 90 : 65 }, c));

  /* ---------- Móviles ---------- */
  const rect = (o1, o2, e1, e2) => [inter(o1, e1), inter(o1, e2), inter(o2, e2), inter(o2, e1), inter(o1, e1)];
  const UNITS = [
    { id: 'GUM-01', name: 'Guardia Urbana 01', short: '01', kind: 'auto', org: 'Guardia Urbana Municipal', plate: 'Interno 101', agents: ['Insp. M. Godoy', 'Ag. L. Benítez'], shift: '06–14 h', loop: rect(15, 25, 4, 12) },
    { id: 'GUM-02', name: 'Guardia Urbana 02', short: '02', kind: 'auto', org: 'Guardia Urbana Municipal', plate: 'Interno 102', agents: ['Ag. S. Ramírez', 'Ag. P. Acosta'], shift: '14–22 h', loop: rect(3, 13, 6, 16) },
    { id: 'PAT-11', name: 'Patrullero Policía 11', short: 'P11', kind: 'policia', org: 'Policía de Santa Fe', plate: 'Móvil 11', agents: ['Sgto. R. Ojeda', 'Cabo F. Molina'], shift: '22–06 h', loop: rect(27, 41, 6, 16) },
    { id: 'PAT-12', name: 'Patrullero Policía 12', short: 'P12', kind: 'policia', org: 'Policía de Santa Fe', plate: 'Móvil 12', agents: ['Cabo J. Sosa', 'Ag. D. Romero'], shift: '14–22 h', loop: [inter(13, 2), inter(37, 2), [calleLat(37), westLon(2)], [calleLat(21), westLon(2)], inter(21, 2), inter(13, 2)] },
    { id: 'MOTO-01', name: 'Moto Guardia 01', short: 'M1', kind: 'moto', org: 'Guardia Urbana Municipal', plate: 'Moto 201', agents: ['Ag. C. Fernández'], shift: '08–16 h', loop: rect(17, 23, 6, 10) },
    { id: 'MOTO-02', name: 'Moto Guardia 02', short: 'M2', kind: 'moto', org: 'Guardia Urbana Municipal', plate: 'Moto 202', agents: ['Ag. N. Giménez'], shift: '16–00 h', loop: rect(1, 9, 2, 12) }
  ];

  /* ---------- Rutas de patrullaje precargadas ---------- */
  const ROUTES = [
    { id: 'R-01', name: 'Centro comercial', color: '#22d3ee', unit: 'MOTO-01', days: [1, 2, 3, 4, 5, 6], start: 14, end: 18, closed: true, points: rect(17, 23, 6, 10) },
    { id: 'R-02', name: 'Sur – Arroyo', color: '#f59e0b', unit: 'GUM-02', days: [0, 1, 2, 3, 4, 5, 6], start: 20, end: 2, closed: true, points: rect(3, 9, 6, 14) },
    { id: 'R-03', name: 'Corredor RN11 y Oeste', color: '#f472b6', unit: 'PAT-12', days: [0, 1, 2, 3, 4, 5, 6], start: 6, end: 12, closed: true, points: [inter(19, 2), inter(31, 2), [calleLat(31), westLon(2)], [calleLat(19), westLon(2)], inter(19, 2)] }
  ];

  /* ---------- Puntos de interés (ubicación aproximada) ---------- */
  const POIS = [
    { name: 'Hospital (aprox.)', pos: [calleLat(35) + 0.0002, calleLon(11)], kind: 'salud' },
    { name: 'Comisaría / Base operativa (aprox.)', pos: inter(21, 6), kind: 'seguridad' },
    { name: 'Municipalidad (aprox.)', pos: inter(19, 9), kind: 'gobierno' },
    { name: 'Escuela (aprox.)', pos: inter(27, 7), kind: 'educacion' },
    { name: 'Escuela (aprox.)', pos: inter(9, 9), kind: 'educacion' },
    { name: 'Terminal de ómnibus (aprox.)', pos: inter(25, 3), kind: 'transporte' }
  ];

  const USERS = [
    { email: 'admin@lastoscas.demo', pass: 'demo2026', role: 'admin', name: 'Administrador del sistema' },
    { email: 'operador@lastoscas.demo', pass: 'demo2026', role: 'operador', name: 'Operador – Centro de Monitoreo' },
    { email: 'patrulla@lastoscas.demo', pass: 'demo2026', role: 'patrulla', name: 'Agente de patrulla' }
  ];
  const ROLE_LABEL = { admin: 'Administrador', operador: 'Operador de monitoreo', patrulla: 'Patrulla' };

  /* ---------- API de datos ---------- */
  let incidents = null;
  const Data = {
    GRID, ZONES, TYPES, CAMERAS, UNITS, ROUTES, POIS, USERS, ROLE_LABEL, SOURCES,
    CENTER: [-28.3535, -59.2615],
    BOUNDS: [[-28.3650, -59.2720], [-28.3420, -59.2530]],
    calleLat, calleLon, inter, address, zoneOf,
    incidents() {
      if (!incidents) {
        incidents = generateIncidents().concat(MT.Store.get('userIncidents', []));
        const edits = MT.Store.get('incidentStatus', {});
        incidents.forEach(i => { if (edits[i.id]) i.status = edits[i.id]; });
      }
      return incidents;
    },
    addIncident(inc) {
      const list = Data.incidents();
      const user = MT.Store.get('userIncidents', []);
      inc.id = inc.id || `INC-${new Date().getFullYear()}-N${String(user.length + 1).padStart(3, '0')}`;
      inc.zone = zoneOf(inc.lat, inc.lng);
      inc.addr = inc.addr || address(inc.lat, inc.lng);
      inc.t = inc.t || Date.now();
      inc.status = inc.status || 'abierto';
      list.push(inc);
      user.push(inc);
      MT.Store.set('userIncidents', user);
      document.dispatchEvent(new CustomEvent('mt:incidents'));
      return inc;
    },
    setStatus(id, status) {
      const inc = Data.incidents().find(i => i.id === id);
      if (!inc) return;
      inc.status = status;
      const edits = MT.Store.get('incidentStatus', {});
      edits[id] = status;
      MT.Store.set('incidentStatus', edits);
      document.dispatchEvent(new CustomEvent('mt:incidents'));
    },
    // Período → [desde, hasta]
    periodRange(period, from, to) {
      const now = Date.now(), DAY = 86400000;
      const start = new Date(); start.setHours(0, 0, 0, 0);
      switch (period) {
        case 'hoy': return [start.getTime(), now];
        case 'semana': return [now - 7 * DAY, now];
        case 'mes': return [now - 30 * DAY, now];
        case 'trimestre': return [now - 90 * DAY, now];
        case 'anio': return [now - 365 * DAY, now];
        case 'custom': return [from || now - 30 * DAY, to || now];
        default: return [0, now];
      }
    },
    filter({ period = 'anio', from, to, types, franja = 'all', zone = 'all' } = {}) {
      const [a, b] = Data.periodRange(period, from, to);
      return Data.incidents().filter(i => {
        if (i.t < a || i.t > b) return false;
        if (types && !types.has(i.type)) return false;
        if (zone !== 'all' && i.zone !== zone) return false;
        if (franja !== 'all') {
          const h = new Date(i.t).getHours();
          if (franja === 'manana' && !(h >= 6 && h < 12)) return false;
          if (franja === 'tarde' && !(h >= 12 && h < 20)) return false;
          if (franja === 'noche' && !(h >= 20 || h < 1)) return false;
          if (franja === 'madrugada' && !(h >= 1 && h < 6)) return false;
        }
        return true;
      });
    },
    // Ventana de N horas con más incidentes
    peakWindow(list, size = 4) {
      const hours = new Array(24).fill(0);
      list.forEach(i => hours[new Date(i.t).getHours()]++);
      let best = 0, bestStart = 0;
      for (let s = 0; s < 24; s++) {
        let c = 0;
        for (let k = 0; k < size; k++) c += hours[(s + k) % 24];
        if (c > best) { best = c; bestStart = s; }
      }
      return { start: bestStart, end: (bestStart + size) % 24, count: best, share: list.length ? best / list.length : 0, hours };
    },
    inHourRange(h, start, end) {
      return start <= end ? h >= start && h < end : h >= start || h < end;
    }
  };

  MT.Data = Data;
})(window.MT);
