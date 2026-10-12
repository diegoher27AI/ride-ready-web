# Ride Ready, app web instalable (semana 1)

La app es el mismo panel de Ride Ready, pero ahora funciona sola, sin Claude. Se instala en el iPhone desde Safari, abre a pantalla completa y funciona sin conexión con los últimos datos guardados.

## Qué hay en la carpeta

| Ruta | Para qué sirve |
| --- | --- |
| `src/panel.html` | El panel (el mismo de tu tablero en Claude) |
| `build.py` | Arma `public/index.html` a partir del panel. Córrelo cada vez que cambie el panel: `python3 build.py` |
| `public/` | La app lista para publicar |
| `public/adapter.js` | Reemplaza a Claude como fuente de datos; hoy lee los archivos de `public/data/` |
| `public/data/` | Tus datos actuales, como ejemplo (un archivo por conjunto de datos) |
| `public/manifest.webmanifest` | Nombre, colores e íconos para instalarla |
| `public/importer.js` | Pantalla "Cargar datos": exportación de Whoop y datos del día, guardados solo en el teléfono |
| `public/sw.js` | Trabaja en segundo plano: guarda la app para que abra sin conexión |
| `public/icons/` | Íconos con la mascota |

## Probarla en la computadora

```
cd public
python3 -m http.server 8765
```

Abre http://localhost:8765 en el navegador.

## Ponerla en tu iPhone

El iPhone solo instala apps web servidas con conexión segura (HTTPS), así que hay que publicar la carpeta `public/` en un servicio de páginas. Lo hacemos juntos desde tu computadora. Después:

1. Abre el enlace en Safari.
2. Toca Compartir y luego "Agregar a inicio".
3. Abre Ride Ready desde el ícono.

**Ojo con la privacidad:** `public/data/` tiene tus datos reales de salud y entrenamiento. No la publiques en una dirección abierta. En la prueba con amigos, cada uno verá solo sus datos (semana 2).

## Cuenta y datos reales (ya funciona)

El botón "Cuenta" permite entrar con el correo (código de 6 números, sin contraseña) y guardar la clave de intervals.icu. Con eso conectado, "Actualizar" trae solas las actividades (Garmin, Karoo) y el bienestar (Whoop: recuperación, VFC, pulso en reposo, sueño) desde intervals.icu, y la app calcula forma física, fatiga, frescura y relación de carga reales.

## Cargar datos a mano (ya funciona)

El botón "Cargar datos" junto a "Actualizar" permite:

- Subir la exportación de Whoop (physiological_cycles.csv y journal_entries.csv), para tener historial antes de conectar la cuenta. Del diario solo se guardan alcohol, azúcar añadida y comida tarde; el resto de respuestas se descarta al leer el archivo.
- Agregar a mano un entrenamiento que no llegue solo (como el HIIT grabado en el reloj de Whoop, que no sube a Garmin): tipo, duración y qué tan duro, para que sume a la forma física y la fatiga.
- Marcar el diario de hoy (alcohol, azúcar, comida tarde), que ningún conector entrega.

Lo cargado a mano queda solo en el teléfono donde se cargó; lo que trae la cuenta (intervals.icu) se guarda en el servidor y se ve en cualquier teléfono donde entres con tu correo.

## Lo que sigue

- **Semana 2:** cuentas de usuario y conexión con intervals.icu y Whoop; subir archivos FIT de actividades.
- **Semana 3:** el cálculo de cada mañana en el servidor y los avisos al teléfono.
- **Semana 4:** prueba con 5 amigos.
