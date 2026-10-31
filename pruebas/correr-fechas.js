// Prueba shiftDates() de adapter.js: corre todas las fechas de los datos de ejemplo
// para que "hoy" siempre sea hoy de verdad, sin importar cuanto tiempo paso desde que
// se generaron. Sin esto, el gato de la demo publica termina "muriendo" solo porque
// pasan las semanas, y el titular vuelve al texto generico.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'adapter.js'), 'utf8');
const start = src.indexOf('  function shiftDates(');
const end = src.indexOf('  async function loadAll()');
const shiftDates = eval('(function(){' + src.slice(start, end) + '\nreturn shiftDates;})()');

let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (ok) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, 'esperaba', JSON.stringify(want), 'obtuve', JSON.stringify(got)); } };

eq('corre una fecha simple', shiftDates('2026-10-12', 18), '2026-10-30');
eq('corre una fecha con hora', shiftDates('2026-10-12T07:00:00Z', 18), '2026-10-30T07:00:00Z');
eq('no toca textos que no son fecha', shiftDates('Recovery 70%', 18), 'Recovery 70%');
eq('no toca numeros ni null', shiftDates(42, 18), 42);
eq('con 0 dias no cambia nada', shiftDates({ date: '2026-10-12' }, 0), { date: '2026-10-12' });
eq('corre dentro de un objeto', shiftDates({ date: '2026-10-12', name: 'Ride' }, 5), { date: '2026-10-17', name: 'Ride' });
eq('corre dentro de un arreglo', shiftDates([{ date: '2026-10-12' }, { date: '2026-10-13' }], 2), [{ date: '2026-10-14' }, { date: '2026-10-15' }]);
eq('corre fechas anidadas, como brief.plan', shiftDates({ plan: [{ day: '2026-10-12', label: 'Rest' }] }, 3), { plan: [{ day: '2026-10-15', label: 'Rest' }] });
eq('cruza de mes bien', shiftDates('2026-10-30', 5), '2026-11-04');
eq('para atras tambien funciona', shiftDates('2026-10-12', -5), '2026-10-07');

// Contra los datos de ejemplo reales del proyecto: el ultimo dia de whoop siempre debe
// quedar en "hoy" de verdad despues de correrlo con el mismo desplazamiento que usa adapter.js.
const dataDir = path.join(__dirname, '..', 'public', 'data');
const brief = JSON.parse(fs.readFileSync(path.join(dataDir, 'brief.json')));
const whoop = JSON.parse(fs.readFileSync(path.join(dataDir, 'whoop.json')));
const now = new Date(); const todayIso = new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const shift = Math.round((Date.parse(todayIso + 'T00:00:00Z') - Date.parse(brief[0].generated_at + 'T00:00:00Z')) / 864e5);
const shifted = shiftDates(whoop, shift);
eq('el ultimo dia de whoop.json queda en hoy de verdad', shifted[shifted.length - 1].date, todayIso);

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
