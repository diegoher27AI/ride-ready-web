// El modelo propio. Se le dan datos donde la respuesta se conoce de antemano, para
// comprobar que la encuentra, y datos sin ninguna senal, para comprobar que NO se
// inventa una. Un modelo que siempre encuentra algo no sirve para nada.
const fs = require('fs');
const path = require('path');

// Carga modelo.js como si estuviera en el navegador.
const window = { };
global.window = window;
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'modelo.js'), 'utf8'));
const M = window.rrModelo;

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const T0 = Date.parse('2024-01-01T00:00:00Z');
const dia = (n) => iso(T0 + n * DAY);

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };
const cerca = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

// Numeros repetibles: sin Math.random, para que la prueba no cambie entre corridas.
let semilla = 12345;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const ruido = (s) => (rnd() - 0.5) * 2 * s;

console.log('Algebra basica:');
{
  // y = 3 + 2*x, exacto
  const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
  const y = [3, 5, 7, 9, 11];
  const c = M.resolver(X, y);
  ok('encuentra la recta exacta', cerca(c[0], 3, 0.05) && cerca(c[1], 2, 0.05), c && c.map((v) => v.toFixed(2)).join(','));
  const b = M.bondad(y, X.map((f) => c[0] * f[0] + c[1] * f[1]));
  ok('ajuste perfecto da r2 = 1', cerca(b.r2, 1, 0.01), b.r2);
}
{
  const X = [[1, 1], [1, 1], [1, 1]];           // columnas iguales: no se puede resolver
  const c = M.resolver(X, [1, 2, 3]);
  ok('no revienta con datos degenerados', c === null || c.every((v) => isFinite(v)));
}

console.log('\nPromedio exponencial:');
{
  const e = M.ema([100, 0, 0, 0, 0, 0, 0, 0], 7);
  ok('sube al primer estimulo', e[0] > 0 && e[0] < 100, e[0].toFixed(1));
  ok('despues solo baja', e.slice(1).every((v, i, a) => i === 0 || v < a[i - 1]));
  const lento = M.ema([100, 0, 0, 0, 0, 0, 0, 0], 42);
  ok('la constante larga reacciona menos', lento[0] < e[0], `${lento[0].toFixed(1)} < ${e[0].toFixed(1)}`);
}

// ---------- constantes de forma y fatiga ----------
// Se fabrica un ciclista con constantes CONOCIDAS (30 y 5) y se ve si las encuentra.
function ciclista({ tf = 30, ta = 5, dias = 400, conPotencia = true, ruidoW = 3 } = {}) {
  const acts = [];
  const cargas = [];
  for (let i = 0; i < dias; i++) {
    // Semana tipica, pero con bloques que suben y bajan y alguna semana de descanso,
    // como entrena la gente de verdad. Con una rutina clavada las constantes de forma
    // NO se pueden distinguir, y el modelo lo detecta (se comprueba aparte, mas abajo).
    const base = [80, 40, 90, 0, 45, 130, 0][i % 7];
    const semana = Math.floor(i / 7);
    const bloque = semana % 4 === 3 ? 0.45 : 0.8 + 0.25 * (semana % 4);
    cargas.push(Math.round(base * bloque));
  }
  const F = M.ema(cargas, tf), A = M.ema(cargas, ta);
  for (let i = 0; i < dias; i++) {
    if (!cargas[i]) continue;
    const a = { date: dia(i), sport: 'Ride', moving_min: 60 + cargas[i] / 2, relative_effort: cargas[i] };
    // Potencia de 20 min segun el modelo: 180 + 0.9*forma - 1.6*fatiga
    if (conPotencia && i % 11 === 0) a.p20_w = Math.round(180 + 0.9 * F[i] - 1.6 * A[i] + ruido(ruidoW));
    acts.push(a);
  }
  return acts;
}

console.log('\nConstantes de forma y fatiga, con un ciclista inventado de 30 y 5 dias:');
{
  const r = M.ajustarForma(ciclista({ tf: 30, ta: 5 }));
  console.log(`   encontro forma ${r.tau_forma} y fatiga ${r.tau_fatiga}, r2 ${r.r2}`);
  ok('dice que el ajuste es propio', r.propio === true, r.motivo);
  ok('encuentra la constante de forma (30, +-6)', cerca(r.tau_forma, 30, 6), r.tau_forma);
  ok('encuentra la constante de fatiga (5, +-3)', cerca(r.tau_fatiga, 5, 3), r.tau_fatiga);
  ok('explica bien las potencias', r.r2 > 0.7, r.r2);
  ok('mas forma suma, mas fatiga resta', r.k1 > 0 && r.k2 > 0, `k1=${r.k1} k2=${r.k2}`);
}

console.log('\nOtro ciclista distinto (50 y 10): tiene que dar OTRO resultado');
{
  const r = M.ajustarForma(ciclista({ tf: 50, ta: 10 }));
  console.log(`   encontro forma ${r.tau_forma} y fatiga ${r.tau_fatiga}, r2 ${r.r2}`);
  ok('la constante de forma es claramente mayor', r.tau_forma > 38, r.tau_forma);
  ok('la de fatiga tambien', r.tau_fatiga > 6, r.tau_fatiga);
}

console.log('\nCuando NO hay con que ajustar, no se inventa:');
{
  const r = M.ajustarForma(ciclista({ conPotencia: false }));
  ok('sin potenciometro cae a los 42 y 7 de libro', r.tau_forma === 42 && r.tau_fatiga === 7, `${r.tau_forma}/${r.tau_fatiga}`);
  ok('y lo dice en vez de fingir', r.propio === false && r.motivo === 'pocas-potencias', r.motivo);
}
{
  // Potencias puramente al azar: no hay senal que encontrar.
  const acts = ciclista({ conPotencia: false });
  acts.forEach((a, i) => { if (i % 11 === 0) a.p20_w = Math.round(230 + ruido(40)); });
  const r = M.ajustarForma(acts);
  ok('con potencias al azar NO afirma un ajuste propio', r.propio === false, `propio=${r.propio} r2=${r.r2}`);
  ok('y explica por que', r.motivo === 'sin-senal' || r.motivo === 'pocas-potencias', r.motivo);
}
ok('sin actividades devuelve nulo', M.ajustarForma([]) === null);

// ---------- recuperacion de manana ----------
// Ciclista con una regla CONOCIDA: la recuperacion de manana baja con la carga de hoy
// y sube si durmio bien.
function bienestar(dias, { conSenal = true } = {}) {
  const w = [];
  const cargaDe = (i) => [80, 40, 90, 0, 45, 130, 0][i % 7];
  const suenoDe = (i) => 6 + (i % 5) * 0.5;
  for (let i = 0; i < dias; i++) {
    // Ojo: la recuperacion de HOY depende de la carga y el sueno de AYER. El modelo
    // predice la de manana con los datos de hoy, asi que el efecto tiene que ir corrido
    // un dia. La primera version de esta prueba lo tenia en el mismo dia y por eso el
    // modelo "encontraba" que entrenar duro sube la recuperacion: aprendia el patron
    // semanal (dia duro, dia de descanso) en vez del efecto del esfuerzo.
    const carga = i > 0 ? cargaDe(i - 1) : 0;
    const sueno = i > 0 ? suenoDe(i - 1) : 7;
    const rec = conSenal
      ? Math.max(5, Math.min(99, 95 - carga * 0.22 + (sueno - 7) * 6 + ruido(4)))
      : Math.max(5, Math.min(99, 60 + ruido(25)));
    w.push({ date: dia(i), recovery: Math.round(rec), hrv: 50 + ruido(5), rhr: 55 + ruido(2),
      hrv_30d: 50, rhr_30d: 55, asleep_h: Math.round(suenoDe(i) * 10) / 10 });
  }
  return w;
}

console.log('\nCuando el ruido tapa la senal, admite que no alcanza:');
{
  // Mismas constantes reales, pero las potencias vienen con mucho ruido (+-45 W).
  // Ahi ya no se puede distinguir 24 dias de 50, y hay que decirlo.
  const r = M.ajustarForma(ciclista({ tf: 30, ta: 5, ruidoW: 45 }));
  console.log(`   r2 ${r.r2}, constantes que empatan: ${r.rango_forma ? r.rango_forma.join(' a ') : 'ninguna'}`);
  ok('NO afirma que el ajuste es propio', r.propio === false, `propio=${r.propio} motivo=${r.motivo}`);
  ok('cae a los 42 y 7 de libro', r.tau_forma === 42 && r.tau_fatiga === 7, `${r.tau_forma}/${r.tau_fatiga}`);
}

console.log('\nRecuperacion de manana, con una regla conocida (la carga la baja):');
{
  const acts = ciclista({ dias: 300 });
  const r = M.recuperacion(bienestar(300), acts);
  console.log(`   ${r.n} dias usados, error medio ${r.mae} puntos, ${r.dentro_10}% dentro de 10`);
  ok('dice que esta listo', r.listo === true, r.n);
  ok('el error medio es chico (bajo 8 puntos)', r.mae != null && r.mae < 8, r.mae);
  ok('acierta dentro de 10 puntos la mayoria de las veces', r.dentro_10 > 70, r.dentro_10);
  ok('encuentra que la carga es lo que mas pesa', r.pesos[0] && /carga/.test(r.pesos[0].campo), r.pesos.map((p) => p.campo + ':' + p.peso).join(' '));
  ok('la carga pesa en contra', r.pesos.find((p) => p.campo === 'carga_hoy').peso < 0);
  ok('dormir pesa a favor', r.pesos.find((p) => p.campo === 'sueno').peso > 0);
  ok('predice un valor de manana creible', r.prediccion_manana > 0 && r.prediccion_manana <= 100, r.prediccion_manana);
  ok('guarda la comparacion predicho contra real', r.pruebas.length > 0 && r.pruebas[0].predicho != null && r.pruebas[0].real != null);
}

console.log('\nSin senal (recuperacion al azar): el modelo tiene que admitirlo');
{
  const r = M.recuperacion(bienestar(300, { conSenal: false }), ciclista({ dias: 300 }));
  console.log(`   error medio ${r.mae} puntos, ${r.dentro_10}% dentro de 10`);
  ok('el error es grande, como debe ser', r.mae > 10, r.mae);
  ok('NO presume de acertar', r.dentro_10 < 60, r.dentro_10);
  ok('y pide rehacer el plan', M.calcular(ciclista({ dias: 300 }), bienestar(300, { conSenal: false })).necesitaReplan === true);
}

console.log('\nCon poco historial no se arriesga:');
{
  const r = M.recuperacion(bienestar(20), ciclista({ dias: 20 }));
  ok('dice que todavia no esta listo', r.listo === false, r.listo);
  ok('y cuantos dias le faltan', r.falta > 0, r.falta);
}
{
  const r = M.recuperacion([], []);
  ok('sin bienestar no revienta', r.listo === false);
}

console.log('\nNada de mirar el futuro (la trampa facil):');
{
  // Si el modelo hiciera trampa, al meterle un salto brusco al final acertaria igual.
  const w = bienestar(300);
  for (let i = 250; i < 300; i++) w[i].recovery = 20;   // cambio de regimen, imposible de prever
  const r = M.recuperacion(w, ciclista({ dias: 300 }));
  const tarde = r.pruebas.filter((p) => p.date >= dia(251) && p.date <= dia(256));
  ok('se equivoca al principio del cambio, no lo adivina', tarde.some((p) => Math.abs(p.error) > 15),
    tarde.map((p) => p.error).join(','));
}

console.log('\nTodo junto:');
{
  const r = M.calcular(ciclista({ dias: 300 }), bienestar(300));
  ok('trae forma y recuperacion', !!r.forma && !!r.recuperacion);
  ok('con buen acierto NO pide rehacer el plan', r.necesitaReplan === false, r.recuperacion.mae);
  ok('deja la fecha del calculo', !!r.calculado);
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
