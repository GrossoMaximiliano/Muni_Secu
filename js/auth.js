/* Login: valida contra usuarios de demo y ofrece ingreso directo como administrador. */
(function (MT) {
  'use strict';
  const { $, icon } = MT;

  // Si ya hay sesión, pasar directo a la app
  if (MT.Store.get('session')) { location.replace('app.html'); return; }

  $('#features').innerHTML = [
    ['map', 'Mapa en vivo de patrullas, cámaras e incidentes'],
    ['target', 'Mapa de calor y detección de zonas críticas'],
    ['radio', 'SOS ciudadano con despacho del móvil más cercano'],
    ['route', 'Planificación y evaluación de recorridos'],
    ['cpu', 'Alertas de video analítica (módulo en prueba)']
  ].map(([i, t]) => `<li>${icon(i, 18)}${t}</li>`).join('');

  $('#demo-login').innerHTML = `${icon('shield', 17)} Ingresar como administrador (demo)`;
  const pwBtn = $('#toggle-pw');
  pwBtn.innerHTML = icon('eye', 16);
  pwBtn.onclick = () => {
    const pw = $('#password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  };

  function start(user) {
    MT.Store.set('session', { email: user.email, name: user.name, role: user.role, since: Date.now() });
    location.href = 'app.html';
  }

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#email').value.trim().toLowerCase();
    const pass = $('#password').value;
    const err = $('#login-error');
    if (!email || !pass) { err.textContent = 'Completá el correo y la contraseña.'; err.classList.remove('hidden'); return; }
    const user = MT.Data.USERS.find(u => u.email === email && u.pass === pass);
    if (!user) { err.textContent = 'Correo o contraseña incorrectos.'; err.classList.remove('hidden'); return; }
    start(user);
  });

  $('#demo-login').addEventListener('click', () => start(MT.Data.USERS[0]));
})(window.MT);
