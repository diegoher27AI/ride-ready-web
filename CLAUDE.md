# Ride Ready: app web (contexto para Claude Code)

Lee este archivo completo antes de tocar código. Después lee `LEEME.md`.

## Quién es el dueño y cómo quiere trabajar

- Juan Diego, ciclista de ruta y montaña en Costa Rica. Es ingeniero mecánico, no programador: tú escribes el código y lo pruebas. A él solo le pides lo que no puedes hacer tú (crear cuentas, aprobar, probar en su iPhone).
- Escríbele siempre en español, en frases cortas y pasos numerados cuando tenga que hacer algo.
- Nunca uses el guion largo en ningún texto. En los textos en español no uses palabras en inglés cuando haya traducción.
- Los textos que ve el usuario en la app van en español y en inglés (selector ES / EN).

## Qué es Ride Ready

Un entrenador diario de ciclismo. Cada mañana decide **entrenar, ir suave o descansar** según la fatiga y la recuperación, y da el entrenamiento del día en vatios y pulso. Hoy existe como complemento de Claude (Cowork) con un panel publicado en Claude. Este proyecto convierte ese panel en una **app web instalable en el iPhone**, como paso previo a una app propia en la App Store.

Partes del panel (en `src/panel.html`):

- **Hoy:** decisión del día con fondo verde, amarillo o rojo; anillos de recuperación, frescura y balance de carga; la **mascota** (gato que se viste según el deporte principal y cambia con el estado: fuerte, listo, cansado, agotado, engordando tras 3 días sin entrenar); regla del día según la recuperación; semana; entrenamiento del día con pasos; metas; lectura del entrenador; próximos días.
- **Tendencias:** forma física, fatiga y frescura; relación de carga; eficiencia aeróbica; potencia por peso; VFC, pulso en reposo y sueño (Whoop); qué mueve tu recuperación; carga mensual.
- **Historial:** año hasta hoy, cumplimiento del plan, últimos 15 días, zonas.
- **Modelo:** pronóstico de recuperación de mañana, simulador de escenarios, respuesta personal al entrenamiento, acierto del modelo.

## Estado actual

Hecho:

1. **Semana 1:** `build.py` arma `public/index.html` a partir de `src/panel.html` con manifiesto, íconos, metadatos de iOS y un trabajador en segundo plano (`public/sw.js`) para abrir sin conexión. `public/adapter.js` reemplaza el entorno de Claude (`window.dash`: `data`, `onData`, `params`, `setParams`, `refresh`, `loader`, `setLink`) leyendo `public/data/*.json`.
2. **Cargar datos:** `public/importer.js` agrega el botón "Cargar datos": importa la exportación de Whoop (CSV) y los números del día escritos a mano, y lo guarda en el teléfono (`localStorage`, clave `rr_local`). `adapter.js` lo mezcla con los datos servidos y recalcula promedios de 7 y 30 días y "qué mueve tu recuperación".

Probado en Chromium con tamaño de iPhone: sin errores, funciona sin conexión, ES / EN. **No se ha probado en un iPhone real ni se ha publicado.**

## Lo que sigue (en este orden)

1. Probar en la computadora: `cd public && python3 -m http.server 8765`.
2. **Publicar de forma privada con HTTPS** para instalarla en el iPhone (Safari › Compartir › Agregar a inicio). `public/data/` tiene los datos reales de salud de Juan Diego: no puede quedar en una dirección pública abierta. Opciones: acceso protegido en el servicio de publicación, o publicar con datos de ejemplo anonimizados y que él cargue los suyos con "Cargar datos".
3. **Semana 2:** cuentas de usuario (entrada por enlace al correo), base de datos por ciclista, conexión con **intervals.icu** (clave de API por usuario) y **Whoop** (API oficial, OAuth), y subir **archivos FIT** de actividades.
4. **Semana 3:** el cálculo de cada mañana en el servidor (traer datos, correr el modelo, reglas de recuperación, texto con la API de Claude) y avisos al teléfono (web push: iOS 16.4 o más reciente y la app abierta desde la pantalla de inicio).
5. **Semana 4:** prueba con 5 amigos, luego 30 a 50.

Pila decidida: código propio con un servicio de base de datos con cuentas y funciones programadas, más un servicio de publicación web. **No usar Base44** (se evaluó y se descartó: dependencia, costo por créditos y la app ya existe como código). Antes de elegir servicios concretos, proponle 1 o 2 opciones gratis y explícale qué cuenta debe crear.

## Reglas que no se negocian

- **Strava:** no usar la API de Strava para alimentar IA. Strava lo prohíbe sin permiso escrito (acuerdo de noviembre de 2024) y desde junio de 2026 exige suscripción al desarrollador. Además, las actividades que llegan a intervals.icu desde Strava no se pueden leer por la API de intervals.icu. Los ciclistas deben conectar su Garmin o Zwift directo a intervals.icu, o subir archivos FIT.
- **Garmin:** su programa de desarrolladores no acepta solicitudes nuevas desde la primavera de 2026. No contar con él.
- **Whoop:** usar solo recuperación, VFC, pulso en reposo y sueño. Nunca entrenamientos ni esfuerzo acumulado de Whoop (los entrenamientos vienen de las actividades). Del diario de Whoop usar **solo** alcohol, azúcar añadida y comida tarde; cualquier otra respuesta del diario se descarta al leer y nunca se guarda ni se muestra. La API de Whoop no entrega el diario: por eso existe el registro manual.
- **Privacidad:** datos de salud de terceros. Cada ciclista ve solo sus datos. Nunca guardes claves, contraseñas ni tokens en el código ni en el repositorio; usa variables de entorno del servicio. No subas `public/data/` reales a ningún lugar público.
- **Salud:** es una ayuda de entrenamiento, no consejo médico. Nunca diagnósticos; reglas conservadoras cuando la recuperación es baja.

## La lógica del día (igual que el complemento)

- Carga diaria = esfuerzo relativo; forma física = promedio exponencial de 42 días; fatiga = 7 días; frescura = forma física de ayer menos fatiga de ayer; relación de carga = suma de 7 días / (suma de 28 días / 4). Relación sobre 1.5 = riesgo alto; 0.8 a 1.3 = productiva.
- Regla por recuperación de Whoop: 67 % o más = sesión planificada (o 60 a 75 min en zona 2 si la relación de carga pasa de 1.5); 34 a 66 % = rodada suave de 45 min; bajo 34 % = descanso total. Bajar un nivel si la VFC está más de 10 % bajo su promedio de 30 días o el pulso en reposo está 4 lpm o más sobre el suyo.
- Modelo personal: `referencia/model.py` (solo numpy). Ajuste personal de forma y fatiga sobre potencias de 20 min, y regresión de la recuperación del día siguiente con validación hacia adelante. Para el servidor se puede correr en Python o pasar a TypeScript; los resultados deben coincidir.
- Formas exactas de cada conjunto de datos: `referencia/conjuntos-de-datos.md`. Instrucciones completas del resumen diario: `referencia/resumen-diario-instrucciones.md`.
- Los textos de los conjuntos de datos están en inglés y el panel los traduce con `i18n_es` (filas `{en, es}`) más un diccionario dentro de `src/panel.html`.

## Cómo trabajar en este proyecto

- Cambios del panel: edita `src/panel.html` y corre `python3 build.py`. No edites `public/index.html` a mano.
- Si cambias archivos que se guardan sin conexión, sube la versión del caché en `public/sw.js` (`rr-shell-vN`).
- Prueba cada cambio en un navegador con tamaño de iPhone (390 × 844), en ES y EN, revisa que no haya errores en la consola y que la página no se desborde a lo ancho.
- Antes de pedirle algo a Juan Diego, termina todo lo que puedas hacer tú.
