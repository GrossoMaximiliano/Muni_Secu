/* Estadísticas: indicadores y gráficos sobre el historial de incidentes. */
(function (MT) {
  'use strict';
  const D = MT.Data;
  const { $, $$, icon, esc, fmt } = MT;
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const S = MT.Stats = { charts: [], period: 'anio' };

  S.chartOpts = function ({ legend = true, horizontal = false, stacked = false } = {}) {
    const grid = 'rgba(138,155,185,.12)', tick = '#8a9bb9';
    return {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      animation: { duration: 500 },
      plugins: {
        legend: { display: legend, labels: { color: '#c5d2e8', boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: 'Inter', size: 11.5 } } },
        tooltip: { backgroundColor: '#16233b', borderColor: '#2d4066', borderWidth: 1, titleColor: '#e6edf7', bodyColor: '#c5d2e8', padding: 10, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
      },
      scales: {
        x: { stacked, grid: { color: horizontal ? grid : 'transparent' }, ticks: { color: tick, font: { family: 'Inter', size: 11 } }, border: { color: grid } },
        y: { stacked, grid: { color: horizontal ? 'transparent' : grid }, ticks: { color: tick, font: { family: 'Inter', size: 11 }, precision: 0 }, border: { display: false }, beginAtZero: true }
      }
    };
  };

  function heatColor(v) { // 0..1 → escala azul → ámbar → rojo
    const stops = [[0, [19, 35, 61]], [0.35, [30, 79, 122]], [0.7, [245, 158, 11]], [1, [239, 68, 68]]];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i];
        const f = (v - a) / (b - a);
        return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * f)).join(',')})`;
      }
    }
    return 'rgb(239,68,68)';
  }

  S.render = function () {
    S.charts.forEach(c => c.destroy());
    S.charts = [];
    const list = D.filter({ period: S.period });
    const [a, b] = D.periodRange(S.period);
    const prev = D.filter({ period: 'custom', from: a - (b - a), to: a });
    const delta = prev.length ? (list.length - prev.length) / prev.length : 0;
    const month = D.filter({ period: 'mes' });
    const resp = list.filter(i => i.respMin);
    const avgResp = resp.length ? resp.reduce((s, i) => s + i.respMin, 0) / resp.length : 0;
    const closed = list.filter(i => i.status === 'cerrado').length;
    const cams = MT.Cameras.cams;
    const units = MT.Patrols.units.filter(u => u.mode !== 'oos' && u.mode !== 'base').length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const PLABEL = { mes: 'últimos 30 días', trimestre: 'últimos 90 días', anio: 'últimos 12 meses' };

    $('#sec-estadisticas').innerHTML = `<div class="page">
      <div class="page-head"><div><h2>Estadísticas</h2><p>Indicadores de los ${PLABEL[S.period]} sobre robos e incidentes registrados. Sirven para medir si las acciones de prevención dan resultado.</p></div>
        <div class="toolbar"><div class="seg" id="st-period"><button data-v="mes">30 días</button><button data-v="trimestre">90 días</button><button data-v="anio">12 meses</button></div>
        <button class="btn btn-sm" id="st-csv">${icon('download', 14)} Exportar CSV</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${icon('pin', 15)} Incidentes</span><span class="val">${fmt.num(list.length)}</span><span class="sub ${delta > 0 ? 'delta-up' : 'delta-down'}">${prev.length ? `${delta > 0 ? '▲' : '▼'} ${fmt.pct(Math.abs(delta))} vs. período anterior` : '&nbsp;'}</span></div>
        <div class="card kpi"><span class="lbl">${icon('clock', 15)} Últimos 30 días</span><span class="val">${month.length}</span><span class="sub">${(month.length / 30).toFixed(1).replace('.', ',')} por día</span></div>
        <div class="card kpi"><span class="lbl">${icon('zap', 15)} Respuesta promedio</span><span class="val">${avgResp ? avgResp.toFixed(1).replace('.', ',') : '—'}<small style="font-size:14px"> min</small></span><span class="sub">desde el aviso hasta el lugar</span></div>
        <div class="card kpi"><span class="lbl">${icon('check', 15)} Casos cerrados</span><span class="val">${list.length ? fmt.pct(closed / list.length) : '—'}</span><span class="sub">${closed} de ${list.length}</span></div>
        <div class="card kpi"><span class="lbl">${icon('car', 15)} Móviles activos</span><span class="val">${units}/${MT.Patrols.units.length}</span><span class="sub">en este momento</span></div>
        <div class="card kpi"><span class="lbl">${icon('video', 15)} Cámaras en línea</span><span class="val">${cams.filter(c => c.status === 'online').length}/${cams.length}</span><span class="sub">${MT.Alerts.list.filter(x => x.t >= today.getTime()).length} alertas IA hoy</span></div>
      </div>
      <div class="grid-3">
        <div class="card"><div class="card-head"><h3>Evolución mensual por tipo</h3><span class="sub">últimos 12 meses</span></div><div class="card-body"><div class="chart-box tall"><canvas id="ch-month"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h3>Por tipo de delito</h3></div><div class="card-body"><div class="chart-box tall"><canvas id="ch-type"></canvas></div></div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>Por hora del día</h3></div><div class="card-body"><div class="chart-box"><canvas id="ch-hour"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h3>Ranking de zonas</h3><span class="sub">incidentes en el período</span></div><div class="card-body"><div class="rank" id="st-rank"></div></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Día de la semana × hora</h3><div class="legend-scale">menos<span class="bar"></span>más</div></div>
        <div class="card-body table-wrap"><table class="heat-table" id="st-heat"></table></div></div>
      <div class="note note-info">${icon('info', 15)}<span>Datos ficticios generados para la demo. Con datos reales, estas vistas se alimentan del registro de incidentes del sistema y, si hay convenio, de las denuncias de la Comisaría.</span></div>
    </div>`;

    $$('#st-period button').forEach(bt => { bt.classList.toggle('active', bt.dataset.v === S.period); bt.onclick = () => { S.period = bt.dataset.v; S.render(); }; });
    $('#st-csv').onclick = () => S.exportCSV(list, `incidentes_${S.period}`);

    // Mensual (siempre 12 meses) apilado por tipo
    const year = D.filter({ period: 'anio' });
    const now = new Date();
    const months = [...Array(12)].map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const types = Object.keys(D.TYPES);
    const byMonth = types.map(t => months.map(mm => year.filter(i => { const d = new Date(i.t); return i.type === t && d.getFullYear() === mm.y && d.getMonth() === mm.m; }).length));
    S.charts.push(new Chart($('#ch-month'), {
      type: 'bar',
      data: { labels: months.map(mm => MONTHS[mm.m]), datasets: types.map((t, k) => ({ label: D.TYPES[t].short, data: byMonth[k], backgroundColor: D.TYPES[t].color, borderRadius: 2, maxBarThickness: 34 })) },
      options: S.chartOpts({ stacked: true })
    }));
    const counts = types.map(t => list.filter(i => i.type === t).length);
    S.charts.push(new Chart($('#ch-type'), {
      type: 'doughnut',
      data: { labels: types.map(t => D.TYPES[t].short), datasets: [{ data: counts, backgroundColor: types.map(t => D.TYPES[t].color), borderColor: '#111b2e', borderWidth: 3 }] },
      options: Object.assign(S.chartOpts(), { scales: {}, cutout: '62%', plugins: Object.assign(S.chartOpts().plugins, { legend: { position: 'bottom', labels: { color: '#c5d2e8', boxWidth: 10, usePointStyle: true, padding: 12, font: { family: 'Inter', size: 11.5 } } } }) })
    }));
    const hours = D.peakWindow(list, 1).hours;
    S.charts.push(new Chart($('#ch-hour'), {
      type: 'bar',
      data: { labels: hours.map((_, h) => String(h).padStart(2, '0')), datasets: [{ label: 'Incidentes', data: hours, backgroundColor: hours.map((_, h) => (h >= 20 || h < 6) ? '#3b82f6' : '#22d3ee'), borderRadius: 3 }] },
      options: S.chartOpts({ legend: false })
    }));

    const zones = Object.keys(D.ZONES).map(z => [z, list.filter(i => i.zone === z).length]).sort((x, y) => y[1] - x[1]);
    const max = zones[0][1] || 1;
    $('#st-rank').innerHTML = zones.map(([z, n], i) => `<div class="rank-row"><span class="n">${i + 1}</span><div><div class="row" style="justify-content:space-between"><span>${esc(D.ZONES[z].name)}</span></div><div class="rank-bar"><i style="width:${n / max * 100}%;background:${i < 2 ? '#ef4444' : i < 4 ? '#f59e0b' : '#22d3ee'}"></i></div></div><span class="mono">${n} <span class="dim">(${list.length ? fmt.pct(n / list.length) : '0%'})</span></span></div>`).join('');

    const m = [...Array(7)].map(() => new Array(24).fill(0));
    list.forEach(i => { const d = new Date(i.t); m[d.getDay()][d.getHours()]++; });
    const mx = Math.max(1, ...m.flat());
    const order = [1, 2, 3, 4, 5, 6, 0];
    $('#st-heat').innerHTML = `<tr><th></th>${[...Array(24).keys()].map(h => `<th>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</th>`).join('')}</tr>` +
      order.map(d => `<tr><th style="text-align:right;padding-right:6px">${WD[d]}</th>${m[d].map((v, h) => `<td style="background:${heatColor(v / mx)}" title="${WD[d]} ${String(h).padStart(2, '0')} h: ${v} incidentes">${v || ''}</td>`).join('')}</tr>`).join('');
  };

  S.exportCSV = function (list, name) {
    const head = ['id', 'fecha', 'hora', 'tipo', 'zona', 'direccion_aprox', 'lat', 'lng', 'estado', 'fuente', 'respuesta_min', 'descripcion'];
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = list.map(i => [i.id, fmt.date(i.t), fmt.time(i.t), D.TYPES[i.type].label, D.ZONES[i.zone].name, i.addr, i.lat.toFixed(6), i.lng.toFixed(6), i.status, i.source, i.respMin || '', i.desc].map(q).join(';'));
    const blob = new Blob(['﻿' + head.join(';') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    MT.toast({ title: 'CSV exportado', msg: `${list.length} registros. Se abre con Excel o Google Sheets.`, level: 'ok', timeout: 4000 });
  };
})(window.MT);
