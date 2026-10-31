// intervals.icu corta cualquier respuesta en 1000 filas y manda las MAS VIEJAS.
// Pidiendo 3 anos de bienestar de un golpe, los ultimos meses nunca llegaban: a Juan
// Diego se le congelo el 22 de julio, exactamente 1000 dias despues del primero.
// Esta prueba simula ese tope y comprueba que ahora si llega todo.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'intervals-sync', 'index.ts'), 'utf8');

// Se sacan las funciones de ventanas del archivo de verdad, sin copiarlas, para que la
// prueba siga valiendo si manana se edita la funcion.
function grab(name) {
  const m = SRC.match(new RegExp(`(async )?function ${name}\\(`));
  if (!m) throw new Error('no esta ' + name);
  const i = m.index;
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error('no cierra ' + name);
}
// Quita solo las anotaciones de tipo; el resto del codigo queda igual al de produccion.
const sinTipos = (s) => s
  .replace(/new Map<[^>]*>>?\(/g, 'new Map(')
  .replace(/:\s*Record<[^>]*>\[\]\s*=/g, ' =')
  .replace(/(\w+):\s*Record<[^>]*>\[\](?=[,)])/g, '$1')
  .replace(/(\w+):\s*(string|number|boolean)(?=[,)])/g, '$1');
const code = ['addDays', 'fetchByWindows', 'dedupe'].map((n) => sinTipos(grab(n))).join('\n');
const WINDOW_DAYS = Number((SRC.match(/WINDOW_DAYS = (\d+)/) || [])[1]);

let fetchIntervals;   // la inyecta cada caso
const make = new Function('WINDOW_DAYS', 'getFetch', `
  const fetchIntervals = (...a) => getFetch()(...a);
  ${code}
  return { addDays, fetchByWindows, dedupe };`);
const { addDays, fetchByWindows, dedupe } = make(WINDOW_DAYS, () => fetchIntervals);

// --- servidor simulado: devuelve un dia por fecha, pero NUNCA mas de 1000 filas,
// y siempre las mas viejas. Es como se porta intervals.icu de verdad. ---
const CAP = 1000;
let llamadas = 0;
function servidor(desdeIso, hastaIso) {
  return (ruta) => {
    llamadas++;
    const u = new URL('https://x' + ruta);
    const o = u.searchParams.get('oldest') || desdeIso;
    const n = u.searchParams.get('newest') || hastaIso;
    const rows = [];
    let d = o > desdeIso ? o : desdeIso;
    const fin = n < hastaIso ? n : hastaIso;
    while (d <= fin && rows.length < CAP) { rows.push({ id: d, readiness: 60 }); d = addDays(d, 1); }
    return Promise.resolve(rows);
  };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

(async () => {
  const HOY = '2026-10-31';
  const DESDE = '2023-10-27';     // 1100 dias atras, lo que pide la funcion
  const MANANA = '2026-11-01';

  console.log('El tope de 1000 filas, como era antes:');
  fetchIntervals = servidor(DESDE, HOY);
  const deUnGolpe = await fetchIntervals(`/api/v1/athlete/0/wellness?oldest=${DESDE}`);
  ok('de un solo pedido llegan 1000 filas', deUnGolpe.length === 1000, deUnGolpe.length);
  ok('y se corta el 22 de julio, como le paso', deUnGolpe[deUnGolpe.length - 1].id === '2026-07-22', deUnGolpe[deUnGolpe.length - 1].id);

  console.log('\nPor ventanas, como queda ahora:');
  llamadas = 0;
  fetchIntervals = servidor(DESDE, HOY);
  const todo = dedupe(await fetchByWindows('/api/v1/athlete/0/wellness', 'clave', DESDE, MANANA), 'id');
  const dias = todo.map((r) => r.id).sort();
  ok('la ventana es menor que el tope', WINDOW_DAYS < 1000, WINDOW_DAYS);
  ok('llega el primer dia', dias[0] === DESDE, dias[0]);
  ok('llega HOY, no el 22 de julio', dias[dias.length - 1] === HOY, dias[dias.length - 1]);
  // 1100 dias atras mas el de hoy: 1101 dias contados de punta a punta.
  ok('no falta ningun dia', dias.length === 1101, dias.length);
  ok('no hay dias repetidos', new Set(dias).size === dias.length);
  ok('hizo varios pedidos, no uno', llamadas >= 6, llamadas);

  console.log('\nSi alguna ventana topara, avisa en vez de callarse:');
  fetchIntervals = () => Promise.resolve(Array.from({ length: 1000 }, (_, i) => ({ id: 'x' + i })));
  let grito = null;
  try { await fetchByWindows('/api/v1/athlete/0/wellness', 'clave', DESDE, MANANA); } catch (e) { grito = e.message; }
  ok('tira error claro, no datos incompletos', !!grito && /1000 filas/.test(grito), grito);

  console.log('\nCuenta nueva, sin historial:');
  fetchIntervals = () => Promise.resolve([]);
  const vacio = await fetchByWindows('/api/v1/athlete/0/wellness', 'clave', DESDE, MANANA);
  ok('devuelve vacio sin reventar', Array.isArray(vacio) && vacio.length === 0);

  console.log('\nDias sueltos en los bordes:');
  ok('addDays suma bien', addDays('2026-02-28', 1) === '2026-03-01', addDays('2026-02-28', 1));
  ok('addDays cruza el ano', addDays('2025-12-31', 1) === '2026-01-01', addDays('2025-12-31', 1));
  ok('addDays respeta el ano bisiesto', addDays('2024-02-28', 1) === '2024-02-29', addDays('2024-02-28', 1));
  ok('dedupe conserva el ultimo', dedupe([{ id: 'a', v: 1 }, { id: 'a', v: 2 }], 'id')[0].v === 2);

  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
