// Prueba sessionToText() y fitToMinutes(): el entrenamiento que se manda al calendario de
// intervals.icu sale del mismo que ves en pantalla, ya ajustado al tiempo que dijiste tener.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel.html'), 'utf8');

function grab(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0) throw new Error('no encontre ' + from);
  return src.slice(a, b);
}
const arr = (v) => (Array.isArray(v) ? v : []);
const code = grab('  function sessionToText(', '  function renderCall() {') + grab('  function fitToMinutes(', '  function todaySession()');
const api = eval('(function(){' + code + '\nreturn { sessionToText, fitToMinutes };})()');
const { sessionToText, fitToMinutes } = api;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n); } };
const eq = (n, got, want) => { const o = JSON.stringify(got) === JSON.stringify(want); if (o) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, '\n    esperaba', JSON.stringify(want), '\n    obtuve  ', JSON.stringify(got)); } };

const steps = () => ([
  { name: 'Calentamiento', min: 8, int: 'warmup', p: [0, 137], hr: [0, 127] },
  { name: 'Rodada suave', min: 32, int: 'active', p: [138, 187], hr: [0, 127] },
  { name: 'Enfriamiento', min: 5, int: 'cooldown', p: [0, 137], hr: [0, 127] },
]);

console.log('Texto para intervals.icu:');
const text = sessionToText({ title: 'Rodada suave', steps: steps() });
ok('trae las tres secciones', ['Warmup', 'Main Set', 'Cooldown'].every((s) => text.includes(s)));
ok('cada paso lleva minutos y vatios', /- 8m 0-137W/.test(text) && /- 32m 138-187W/.test(text));
eq('sin pasos no manda nada', sessionToText({ steps: [] }), null);
eq('sin entrenamiento no manda nada', sessionToText(null), null);

console.log('\nAjustar al tiempo disponible:');
const total = (s) => s.reduce((a, x) => a + x.min, 0);
[30, 45, 60, 90].forEach((m) => {
  const out = fitToMinutes(steps(), m);
  eq(`${m} min da exactamente ${m} min`, total(out), m);
  ok(`${m} min conserva los tres pasos`, out.length === 3);
  ok(`${m} min deja calentamiento de 4 min o mas`, out[0].min >= 4);
});
eq('sin tiempo pedido no cambia nada', fitToMinutes(steps(), null), steps());
eq('el mismo tiempo no cambia nada', total(fitToMinutes(steps(), 45)), 45);

console.log('\nCon muy poco tiempo sigue siendo un entrenamiento valido:');
const tiny = fitToMinutes(steps(), 20);
eq('20 min da 20 min', total(tiny), 20);
ok('20 min deja un bloque principal de 5 min o mas', tiny.find((s) => s.int === 'active').min >= 5);
ok('20 min no deja pasos en cero ni negativos', tiny.every((s) => s.min > 0));

console.log('\nNo toca los vatios al cambiar el tiempo:');
const scaled = fitToMinutes(steps(), 90);
eq('la intensidad del bloque principal se mantiene', scaled.find((s) => s.int === 'active').p, [138, 187]);

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
