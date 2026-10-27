# Centro de Monitoreo Urbano – Las Toscas (demo)

Demo de presentación de un sistema de seguimiento de incidentes de inseguridad para la Municipalidad de Las Toscas (Santa Fe). Hecho solo con HTML, CSS y JavaScript, sin servidor ni base de datos. **Todos los datos son ficticios.**

## Cómo abrirlo

- Doble clic en `index.html` (Chrome o Edge), o
- servirlo desde la carpeta: `python -m http.server 8000` y entrar a `http://localhost:8000`.

Necesita internet para el mapa (OpenStreetMap), las librerías (Leaflet, Chart.js) y el ruteo por calles (OSRM público). Sin ruteo, las rutas se trazan de forma aproximada.

En el login, el botón **"Ingresar como administrador (demo)"** entra directo. Usuarios de prueba: `admin@lastoscas.demo`, `operador@lastoscas.demo`, `patrulla@lastoscas.demo` (contraseña `demo2026`).

## Guion sugerido para la presentación

1. **Mapa en vivo**: lo que pasa hoy: móviles moviéndose, cámaras, incidentes del día, alertas IA y SOS.
2. **Mapa histórico**: incidentes de la semana, el mes, el año o un rango de fechas, con mapa de calor y filtros por tipo, franja horaria y zona. Sin móviles (solo existen en vivo).
3. **SOS ciudadano** (botón rojo arriba del mapa): llega la alerta, el sistema propone el móvil más cercano, lo despacha, traza la ruta por calles y muestra la llegada estimada. Cerrar el caso lo suma al historial.
4. **Clic derecho en cualquier calle**: SOS, reporte de vecino o carga de incidente en ese punto.
5. **Cámaras**: clic en una camarita del mapa o en la sección Cámaras. Con "Simular alerta IA" aparece el recuadro de detección.
6. **Rutas de patrullaje**: comparar el horario de cada recorrido con el horario real de los hechos y ajustarlo con un clic.
7. **Análisis y planificación**: zonas críticas, recomendaciones y simulador de cobertura de cámaras. Informe imprimible.
8. **Hoja de ruta**: qué es real, qué está simulado y qué hace falta para implementarlo.

## Qué está simulado

Posiciones GPS de los móviles, video de las cámaras, alertas de video analítica (IA) y los avisos SOS. El detalle de qué hace falta para cada uno está en la sección **Hoja de ruta** de la app.

Lo que se carga durante la demo (incidentes, rutas, estados) queda guardado en el navegador. Para empezar de cero, borrar los datos del sitio en el navegador.

## Estructura

```
index.html       login
app.html         aplicación
css/styles.css   estilos
js/utils.js      utilidades, íconos, ruteo
js/data.js       datos simulados (grilla de calles real aproximada)
js/map.js        mapa en vivo (hoy), capas
js/history.js    mapa histórico con filtros y calor
js/patrols.js    móviles y despacho
js/cameras.js    cámaras y visor simulado
js/alerts.js     alertas IA simuladas
js/sos.js        SOS, reportes y casos
js/routes.js     rutas de patrullaje
js/stats.js      estadísticas
js/analysis.js   zonas críticas, recomendaciones, informe
js/sections.js   incidentes, flota, hoja de ruta
js/app.js        arranque y navegación
```
