// Prueba la decision del dia usando el codigo real extraido de src/panel.html.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'panel.html'), 'utf8');

const start = src.indexOf('  function dayCall() {');
const end = src.indexOf('  function renderCall() {');
if (start < 0 || end < 0) throw new Error('no encontre dayCall/callTargets');
const code = src.slice(start, end);

const DAY = 864e5;
const pd = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const fmt0 = (v) => String(Math.round(v));
const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const L = (en) => en;
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => v;

let WHOOP = [], PMC = null, ZONES = null;
const whoopRows = () => WHOOP;
const pmcState = () => PMC;
const firstOf = (id) => (id === 'zones' ? ZONES : null);

const api = eval('(function () {' + code + '\nreturn { dayCall, callTargets };\n})()');
const dayCall = api.dayCall, callTargets = api.callTargets;

const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

function row(over) {
  return Object.assign({ date: TODAY, dt: pd(TODAY), recovery: 70, hrv: 50, hrv_30d: 50, rhr: 55, rhr_30d: 55 }, over);
}
function setup(whoopOver, acwr, realDays) {
  WHOOP = [row(whoopOver)];
  const n = realDays == null ? 30 : realDays;   // 30 dias de historial real, salvo que la prueba pida otra cosa
  PMC = { last: { acwr: acwr == null ? 1.0 : acwr }, real: new Array(n).fill(0) };
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FALLA', name, '-> esperaba', want, 'obtuve', got); }
}

console.log('Reglas base (sin disparadores):');
setup({ recovery: 80 }); check('80% = verde (2)', dayCall().level, 2);
setup({ recovery: 67 }); check('67% justo = verde (2)', dayCall().level, 2);
setup({ recovery: 66 }); check('66% = amarillo (1)', dayCall().level, 1);
setup({ recovery: 34 }); check('34% justo = amarillo (1)', dayCall().level, 1);
setup({ recovery: 33 }); check('33% = rojo (0)', dayCall().level, 0);

console.log('\nBaja un nivel si la VFC esta mas de 10% bajo su promedio de 30 dias:');
setup({ recovery: 80, hrv: 44, hrv_30d: 50 });   // 44 < 45 => dispara
check('VFC 44 vs 50 (12% abajo) baja verde a amarillo', dayCall().level, 1);
check('y lo marca como bajado', dayCall().downgraded, true);
setup({ recovery: 80, hrv: 46, hrv_30d: 50 });   // 46 > 45 => no dispara
check('VFC 46 vs 50 (8% abajo) NO baja', dayCall().level, 2);
setup({ recovery: 80, hrv: 45, hrv_30d: 50 });   // exactamente 10% => no es "mas de 10%"
check('VFC exactamente 10% abajo NO baja', dayCall().level, 2);

console.log('\nBaja un nivel si el pulso en reposo esta 4 lpm o mas sobre el suyo:');
setup({ recovery: 80, rhr: 59, rhr_30d: 55 });
check('pulso +4 baja verde a amarillo', dayCall().level, 1);
setup({ recovery: 80, rhr: 58, rhr_30d: 55 });
check('pulso +3 NO baja', dayCall().level, 2);

console.log('\nNunca baja de rojo, ni baja dos niveles:');
setup({ recovery: 20, rhr: 70, rhr_30d: 55, hrv: 20, hrv_30d: 50 });
check('rojo con disparadores sigue rojo', dayCall().level, 0);
setup({ recovery: 80, rhr: 70, rhr_30d: 55, hrv: 20, hrv_30d: 50 });
check('verde con los dos disparadores baja solo un nivel', dayCall().level, 1);

console.log('\nRelacion de carga sobre 1.5 con luz verde:');
setup({ recovery: 80 }, 1.6); check('verde + ACWR 1.6 = zona 2', dayCall().spike, true);
setup({ recovery: 80 }, 1.4); check('verde + ACWR 1.4 = sesion normal', dayCall().spike, false);
setup({ recovery: 50 }, 1.9); check('amarillo + ACWR alto no marca zona 2', dayCall().spike, false);

console.log('\nCon poco historial, la relacion de carga no se usa (se dispara sola):');
setup({ recovery: 80 }, 4.0, 10); check('verde + ACWR 4.0 pero solo 10 dias de historial: no marca zona 2', dayCall().spike, false);
setup({ recovery: 80 }, 4.0, 27); check('27 dias (uno antes del minimo) todavia no cuenta', dayCall().spike, false);
setup({ recovery: 80 }, 4.0, 28); check('28 dias ya cuenta', dayCall().spike, true);

console.log('\nDatos viejos:');
const old = new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10);
WHOOP = [row({ date: old, dt: pd(old) })]; PMC = { last: { acwr: 1 }, real: new Array(30).fill(0) };
check('recuperacion de hace 5 dias no decide', dayCall(), null);
const yest = new Date(pd(TODAY).getTime() - DAY).toISOString().slice(0, 10);   // ayer en hora local, igual que el codigo
WHOOP = [row({ date: yest, dt: pd(yest) })];
check('la de ayer si decide, marcada como vieja', dayCall() && dayCall().stale, true);
WHOOP = []; check('sin datos no decide', dayCall(), null);

console.log('\nObjetivos usan las zonas reales:');
ZONES = { power_zones: [{ label: 'Z2 Endurance', min: 148, max: 198 }], heart_rate_zones: [{ label: 'Z1 Recovery', min: 0, max: 127 }, { label: 'Z2 Endurance', min: 128, max: 158 }] };
check('zona 2 usa los vatios reales', callTargets(2, true).detail, '148–198 W · HR 128–158');
check('suave usa el pulso real', callTargets(1).detail, 'under 148 W · HR under 127');
ZONES = null;
check('sin zonas no inventa numeros', callTargets(2, true).detail, '');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
