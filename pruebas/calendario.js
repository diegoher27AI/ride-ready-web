// Prueba callWorkoutText(): el texto del entrenamiento que se manda al calendario de
// intervals.icu, en la sintaxis que ellos entienden (Warmup/Main Set/Cooldown + pasos "- Nm X-YW").
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel.html'), 'utf8');

const start = src.indexOf('  function callWorkoutText(');
const end = src.indexOf('  function renderCall() {');
const code = src.slice(start, end);

let ZONES = null;
const firstOf = (id) => (id === 'zones' ? ZONES : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => v;
const L = (en) => en;   // solo se prueba el texto en ingles, que es el que lee intervals.icu

const callWorkoutText = eval('(function(){' + code + '\nreturn callWorkoutText;})()');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FALLA', name, '\n    esperaba', JSON.stringify(want), '\n    obtuve  ', JSON.stringify(got)); }
}

console.log('Sin decision (descanso o sesion planificada generica): no manda nada');
check('nivel 0 (descanso) no manda', callWorkoutText(0, false), null);
check('nivel 2 sin pico (sesion planificada, sin numeros propios) no manda', callWorkoutText(2, false), null);

console.log('\nCon zonas reales:');
ZONES = { power_zones: [{ label: 'Z1 Recovery', min: 0, max: 148 }, { label: 'Z2 Endurance', min: 149, max: 198 }] };
const r1 = callWorkoutText(1, false);
check('nivel 1 (suave) trae nombre', r1.name, 'Recovery spin');
check('nivel 1 usa la zona 1 en el calentamiento', /\d+-148W/.test(r1.text), true);
check('nivel 1 usa la zona 2 en el bloque principal', r1.text.includes('149-198W'), true);
check('nivel 1 dura 45 min en total (8 + 32 + 5)', /8m/.test(r1.text) && /32m/.test(r1.text) && /5m/.test(r1.text), true);
check('trae las tres secciones', ['Warmup', 'Main Set', 'Cooldown'].every((s) => r1.text.includes(s)), true);

const r2 = callWorkoutText(2, true);
check('nivel 2 con pico trae nombre', r2.name, 'Zone 2 ride');
check('nivel 2 con pico usa la zona 2 en el bloque principal', r2.text.includes('149-198W'), true);
check('nivel 2 con pico dura 75 min (10 + 55 + 10)', /10m/.test(r2.text) && /55m/.test(r2.text), true);

console.log('\nSin zonas guardadas, usa un numero razonable por defecto (no se rompe):');
ZONES = null;
const r3 = callWorkoutText(1, false);
check('nivel 1 sin zonas sigue trayendo texto', typeof r3.text === 'string' && r3.text.length > 0, true);
check('nivel 1 sin zonas usa el respaldo 110-150W', r3.text.includes('110-150W'), true);

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
