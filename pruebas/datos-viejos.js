// Cuando el ciclista ya tiene datos suyos pero los de hoy todavia no llegan (Whoop
// sin sincronizar, por ejemplo), la app NO debe mostrar el dia de ejemplo como si fuera
// suyo: tiene que decir que faltan los numeros de hoy.
// Caso real: a Juan Diego le salio "Dia de ejemplo ... segun datos de muestra" con la
// cuenta conectada, porque el bienestar venia con dias de atraso.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// LAG = dias de atraso del bienestar. 0 = al dia, 3 = como le paso de verdad.
// SRC = de donde vienen los datos: 'intervals.icu' (suyos) o 'example' (los de muestra).
function run(LAG, SRC, lang) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = [];
  for (let i = 45; i >= LAG; i--) w.push({ source: SRC, date: iso(i), recovery: i === LAG ? 54 : 65, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: 8 });
  data.whoop = w;
  const acts = [];
  for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
  data.activities = acts;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const days = []; for (let i = 45; i >= 0; i--) days.push(iso(i));
  let fit = 0, fat = 0; const pmc = []; const loads = days.map((d) => byDate.get(d) || 0);
  days.forEach((date, i) => {
    fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
    const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
    const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
    const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
    pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
  });
  data.pmc = pmc;
  data.zones = [{ weight_kg: 85.5, ftp_w: 250, ftp_wkg: 2.92, hr_max: 196, device: 'intervals.icu',
    power_zones: [{ label: 'Z2 Endurance', min: 138, max: 187 }],
    heart_rate_zones: [{ label: 'Z2 Endurance', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','${lang}');
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'${lang}'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
    window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), signedIn: () => true };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  return { title: q('hdr-title'), sub: q('hdr-sub'), wk: q('wk-title'), purpose: q('wk-purpose'),
    eyebrow: q('wk-eyebrow'), steps: q('wk-steps'), pill: q('hdr-pill') };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra ? '->' + extra : ''); } };
const DEMO = /ejemplo|muestra|Example|demo/i;

console.log('Sus datos, al dia (recuperacion 54% de hoy):');
let r = run(0, 'intervals.icu', 'es');
ok('da la decision de hoy', /suave/i.test(r.title), r.title);
ok('nada de texto de ejemplo', !DEMO.test(r.title + r.sub + r.wk + r.purpose), r.title + ' / ' + r.sub.slice(0, 60));
ok('tiene entrenamiento con pasos', r.steps.length > 10, r.steps.slice(0, 50));

console.log('\nSus datos, con 3 dias de atraso:');
r = run(3, 'intervals.icu', 'es');
ok('NO muestra el dia de ejemplo', !DEMO.test(r.title + r.sub), r.title + ' / ' + r.sub.slice(0, 70));
ok('dice que espera sus numeros', /Esperando tus números/.test(r.title), r.title);
ok('dice de cuando es el ultimo dato', /54%/.test(r.sub) && /3 días/.test(r.sub), r.sub.slice(0, 90));
ok('dice que toque Actualizar', /Actualizar/.test(r.sub), r.sub.slice(0, 90));
ok('NO muestra el entrenamiento de ejemplo', !DEMO.test(r.wk + r.purpose) && !/Endurance plus|Openers/i.test(r.wk), r.wk);
ok('la tarjeta dice que falta la sesion', /Todavía sin sesión/.test(r.wk), r.wk);
ok('la tarjeta habla de hoy, no de otra fecha', /^Hoy$/.test(r.eyebrow), r.eyebrow);
ok('no lista pasos que no son suyos', r.steps.length === 0, r.steps.slice(0, 60));

console.log('\nLo mismo en ingles:');
r = run(3, 'intervals.icu', 'en');
ok('titular en ingles', /Waiting for your numbers/.test(r.title), r.title);
ok('tarjeta en ingles', /No session yet/.test(r.wk), r.wk);
ok('sin texto de ejemplo', !DEMO.test(r.title + r.sub + r.wk + r.purpose), r.title);

console.log('\nCuenta sin conectar (solo datos de muestra):');
r = run(3, 'example', 'es');
ok('ahi si se puede mostrar el ejemplo', DEMO.test(r.title) || r.wk.length > 0, r.title + ' / ' + r.wk);
ok('no promete numeros que no existen', !/Esperando tus números/.test(r.title), r.title);

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
