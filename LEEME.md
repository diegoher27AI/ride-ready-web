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

## Cargar datos a mano (ya funciona)

El botón "Cargar datos" junto a "Actualizar" permite:

- Subir la exportación de Whoop (physiological_cycles.csv y journal_entries.csv). Del diario solo se guardan alcohol, azúcar añadida y comida tarde; el resto de respuestas se descarta al leer el archivo.
- Escribir los números de Whoop de la mañana y marcar alcohol, azúcar o comida tarde.

Todo queda solo en el teléfono hasta que exista el servidor. Los gráficos de cuerpo y "Qué mueve tu recuperación" se recalculan al momento.

## Lo que sigue

- **Semana 2:** cuentas de usuario y conexión con intervals.icu y Whoop; subir archivos FIT de actividades.
- **Semana 3:** el cálculo de cada mañana en el servidor y los avisos al teléfono.
- **Semana 4:** prueba con 5 amigos.
