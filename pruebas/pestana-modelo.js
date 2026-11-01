// La pestana Modelo, llena con el modelo propio (que corre en el telefono y no cuesta nada).
// Lo que se comprueba: que los numeros sean suyos, que el simulador responda al esfuerzo,
// y sobre todo que cuando el modelo NO puede, la tarjeta se esconda en vez de inventar.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const DAY = 864e5;
const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4);
const atras = (n) => new Date(hoy.getTime() - n * DAY).toISOString().slice(0, 10);

let semilla = 999;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const ruido = (s) => (rnd() - 0.5) * 2 * s;

// DIAS de historial. CON_POTENCIA mete mejores 20 min.
function datos(DIAS, { conPotencia = true } = {}) {
  const cargaDe = (i) => {
    const base = [80, 40, 90, 0, 45, 130, 0][i % 7];
    const sem = Math.floor(i / 7);
    return Math.round(base * (sem % 4 === 3 ? 0.45 : 0.8 + 0.25 * (sem % 4)));
  };
  const acts = [], wh = [];
  const cargas = []; for (let i = 0; i < DIAS; i++) cargas.push(cargaDe(i));
  // forma y fatiga con constantes 32 y 6, para ver si las encuentra
  const ema = (t) => { const o = []; let v = 0; const a = 1 - Math.exp(-1 / t); cargas.forEach((c) => { v += a * (c - v); o.push(v); }); return o; };
  const F = ema(32), A = ema(6);
  for (let i = 0; i < DIAS; i++) {
    const d = atras(DIAS - 1 - i);
    if (cargas[i]) {
      const a = { source: 'intervals.icu', date: d, name: 'Ride', sport: 'Ride',
        moving_min: 40 + cargas[i] / 2, distance_km: 30, relative_effort: cargas[i],
        calories: 600, avg_hr: 130 + cargas[i] / 8, max_hr: 170, avg_watts: 160 };
      if (conPotencia && i % 11 === 0) a.p20_w = Math.round(180 + 0.9 * F[i] - 1.6 * A[i] + ruido(3));
      acts.push(a);
    }
    // La recuperacion de hoy depende de la carga y el sueno de AYER.
    const cAyer = i > 0 ? cargas[i - 1] : 0;
    const sueno = 6 + (i % 5) * 0.5;
    const rec = Math.max(5, Math.min(99, 95 - cAyer * 0.22 + (sueno - 7) * 6 + ruido(4)));
    wh.push({ source: 'intervals.icu', date: d, recovery: Math.round(rec), hrv: 50 + ruido(4), rhr: 55 + ruido(2),
      hrv_30d: 50, hrv_7d: 50, rhr_30d: 55, rhr_7d: 55, asleep_h: Math.round(sueno * 10) / 10, need_h: null });
  }
  return { acts, wh };
}

function run(DIAS, opts = {}, lang = 'es') {
  const { acts, wh } = datos(DIAS, opts);
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  data.activities = acts; data.whoop = wh;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const dias = []; for (let i = DIAS - 1; i >= 0; i--) dias.push(atras(i));
  let fit = 0, fat = 0; const pmc = []; const loads = dias.map((d) => byDate.get(d) || 0);
  dias.forEach((date, i) => {
    fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
    const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
    const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
    const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
    pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
  });
  data.pmc = pmc;
  data.fitness_hist = pmc.filter((d, i) => i % 7 === 0).map((d) => ({ date: d.date, fitness: d.fitness, fatigue: d.fatigue }));
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 192, device: 'intervals.icu',
    power_zones: [{ label: 'Z2 Endurance', min: 138, max: 187 }], heart_rate_zones: [{ label: 'Z2 Endurance', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','${lang}');
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'${lang}'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, savePerfil: () => true, clear: () => {} };
    window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), signedIn: () => true };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'modelo.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  doc.getElementById('tab-model').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  const visible = (id) => { const e = doc.getElementById(id); return !!e && !e.hidden; };
  return { q, visible, doc, window };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

console.log('Con 300 dias de historial y potencias:');
let r = run(300);
ok('ya NO sale el aviso de que no existe', !r.visible('card-sinmodelo'), r.q('card-sinmodelo').slice(0, 50));
ok('predice tu recuperacion de manana', r.visible('card-fc') && /^\d+$/.test(r.q('fc-v')), r.q('fc-v'));
const pred = +r.q('fc-v');
ok('la prediccion es un porcentaje creible', pred > 0 && pred <= 100, pred);
ok('dice cuanto se puede equivocar', /puntos/.test(r.q('fc-cap')), r.q('fc-cap').slice(0, 90));
ok('dice que se entrena con el pasado', /pasado/.test(r.q('fc-cap')), r.q('fc-cap').slice(0, 120));

console.log('\nEl simulador de hoy:');
{
  const filas = [...r.doc.querySelectorAll('#scen .sr')];
  const vals = filas.map((f) => +(f.querySelector('.fv').textContent || '').replace('%', ''));
  console.log('   ', filas.map((f, i) => f.querySelector('.sl').childNodes[0].textContent + ' ' + vals[i] + '%').join(' | '));
  ok('muestra las cuatro opciones', filas.length === 4, filas.length);
  ok('descansar deja mejor recuperacion que un dia duro', vals[0] > vals[3], `${vals[0]} vs ${vals[3]}`);
  ok('y va bajando con el esfuerzo', vals[0] >= vals[1] && vals[1] >= vals[2] && vals[2] >= vals[3], vals.join(','));
  ok('todos son porcentajes validos', vals.every((v) => v > 0 && v <= 100), vals.join(','));
}

console.log('\nQue mueve tu recuperacion:');
{
  const filas = [...r.doc.querySelectorAll('#drv .fr')];
  ok('lista los factores', filas.length >= 4, filas.length);
  const texto = r.q('drv');
  ok('incluye la carga', /carga/i.test(texto), texto.slice(0, 80));
  ok('incluye el sueno', /dormi/i.test(texto), texto.slice(0, 120));
  ok('dice de cuantos dias aprendio', /\d+ días/.test(r.q('drv-cap')), r.q('drv-cap').slice(0, 80));
}

console.log('\nComo responde tu cuerpo:');
{
  ok('la tarjeta se ve', r.visible('card-resp'));
  const chips = r.q('resp-chips');
  console.log('   ', chips);
  ok('dice en cuantos dias se construye la forma', /\d+ d/.test(chips), chips);
  ok('y que son tuyos, no de libro', /tuyo/.test(chips), chips);
  ok('NO son los 42 y 7 de libro', !/42 d/.test(chips) && !/\b7 d/.test(chips), chips);
  ok('explica cuanto explica', /Explica/.test(r.q('resp-note')), r.q('resp-note').slice(0, 80));
}

console.log('\nAcierto del modelo:');
{
  ok('la tarjeta se ve', r.visible('card-acc'));
  const cap = r.q('acc-cap');
  console.log('   ', cap.slice(0, 120));
  ok('dice por cuanto se equivoca', /puntos en promedio/.test(cap), cap.slice(0, 90));
  ok('y cuantas veces acierta dentro de 10', /% de las veces/.test(cap), cap.slice(0, 120));
  ok('dibuja la comparacion', r.doc.querySelectorAll('#c-acc path').length >= 2, r.doc.querySelectorAll('#c-acc path').length);
}

console.log('\nTu entrenamiento a lo largo del tiempo:');
{
  ok('la tarjeta se ve', r.visible('card-years'));
  ok('no dice "desde 2014" del ejemplo', !/2014/.test(r.q('yrs-h')), r.q('yrs-h'));
  ok('los recuadros salen de tu historial', /mejor marca/i.test(r.q('yrs-chips')), r.q('yrs-chips').slice(0, 80));
}

console.log('\nSIN potencias: admite que no puede ajustar las constantes');
r = run(300, { conPotencia: false });
{
  const chips = r.q('resp-chips');
  console.log('   ', chips, '|', r.q('resp-note').slice(0, 70));
  ok('cae a los valores de libro', /de libro/.test(chips), chips);
  ok('y dice como arreglarlo', /Cargar datos/.test(r.q('resp-note')), r.q('resp-note').slice(0, 90));
  ok('pero la prediccion sigue funcionando', r.visible('card-fc') && +r.q('fc-v') > 0, r.q('fc-v'));
}

console.log('\nCon poco historial: se esconde en vez de inventar');
r = run(20);
{
  ok('no predice la recuperacion', !r.visible('card-fc'));
  ok('no muestra el simulador', !r.visible('card-scen'));
  ok('no muestra que mueve tu recuperacion', !r.visible('card-drv'));
  ok('no muestra el acierto', !r.visible('card-acc'));
  ok('avisa que el modelo todavia no existe', r.visible('card-sinmodelo'));
}

console.log('\nEn ingles:');
r = run(300, {}, 'en');
ok('la prediccion esta en ingles', /trained on the past/i.test(r.q('fc-cap')), r.q('fc-cap').slice(0, 80));
ok('y las constantes tambien', /yours/i.test(r.q('resp-chips')), r.q('resp-chips'));

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
