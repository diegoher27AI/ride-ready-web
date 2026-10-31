// intervals.icu crea la fila del dia de bienestar en cuanto amanece, y segun la zona
// horaria hasta la de manana, aunque Whoop todavia no haya mandado la recuperacion.
// Esas filas van vacias. La app miraba la ULTIMA fila a ciegas, veia una vacia y se
// rendia, con el dia de ayer perfecto justo detras.
// Caso real de Juan Diego: 1102 filas, la ultima el 2026-11-01 sin recuperacion, y la
// de hoy (2026-10-31) con 70. La app decia "Esperando tus numeros".
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// COLA = como vienen los ultimos dias. Cada entrada: dias de atraso y si trae recuperacion.
function run(COLA, lang) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const vacio = { recovery: null, hrv: null, rhr: null, asleep_h: null };
  const lleno = (rec) => ({ recovery: rec, hrv: 50, rhr: 55, asleep_h: 7.2 });
  const w = [];
  // 45 dias buenos de fondo, como su historial.
  const desde = Math.max(...COLA.map((c) => c.atraso)) + 1;
  for (let i = 45; i >= desde; i--) w.push({ source: 'intervals.icu', date: iso(i), ...lleno(65), hrv_30d: 50, hrv_7d: 50, rhr_30d: 55, rhr_7d: 55, need_h: 8 });
  COLA.forEach((c) => w.push({ source: 'intervals.icu', date: iso(c.atraso), ...(c.rec == null ? vacio : lleno(c.rec)), hrv_30d: 50, hrv_7d: 50, rhr_30d: 55, rhr_7d: 55, need_h: 8 }));
  data.whoop = w.sort((a, b) => (a.date < b.date ? -1 : 1));

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
  return { title: q('hdr-title'), sub: q('hdr-sub'), pill: q('hdr-pill'), wk: q('wk-title'),
    steps: q('wk-steps'), rec: q('r-rec-v') || q('ring-rec') || '', cuerpo: doc.body.textContent };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

// Su caso exacto: manana existe y va vacia; hoy trae 70.
console.log('Su caso: la fila de manana esta vacia, la de hoy trae 70');
let r = run([{ atraso: 0, rec: 70 }, { atraso: -1, rec: null }], 'es');
ok('NO se rinde con "Esperando tus numeros"', !/Esperando tus números/.test(r.title), r.title);
ok('da la decision del dia de verdad', /entrena|suave|descans/i.test(r.title), r.title);
ok('usa el 70 de hoy, no la fila vacia', /70/.test(r.cuerpo));
ok('NO lee la fila vacia como 0%', !/Recuperación 0%/.test(r.cuerpo) && !/descans/i.test(r.title), r.title);
ok('nada de texto de ejemplo', !/ejemplo|muestra/i.test(r.title + r.sub), r.title);

// Con 54% toca rodada suave, que si trae pasos propios.
console.log('\nLo mismo con 54%, que si da entrenamiento con pasos');
r = run([{ atraso: 0, rec: 54 }, { atraso: -1, rec: null }], 'es');
ok('da la rodada suave', /suave/i.test(r.title), r.title);
ok('con pasos de verdad', r.steps.length > 10, r.steps.slice(0, 60));

console.log('\nHoy vacia todavia, pero ayer trae 70 (tipico de la manana temprano)');
r = run([{ atraso: 1, rec: 70 }, { atraso: 0, rec: null }], 'es');
ok('igual decide, con el dato de ayer', !/Esperando tus números/.test(r.title), r.title);
ok('da una decision', /entrena|suave|descans/i.test(r.title), r.title);

console.log('\nTres dias vacios seguidos: ahi si falta el dato');
r = run([{ atraso: 3, rec: 70 }, { atraso: 2, rec: null }, { atraso: 1, rec: null }, { atraso: 0, rec: null }], 'es');
ok('dice honestamente que espera tus numeros', /Esperando tus números/.test(r.title), r.title);
ok('NO cae en el dia de ejemplo', !/ejemplo|muestra/i.test(r.title + r.sub), r.title + ' / ' + r.sub.slice(0, 60));
ok('dice de cuando es el ultimo dato', /3 días/.test(r.sub), r.sub.slice(0, 80));

console.log('\nTodo al dia, sin filas vacias (que no se haya roto nada)');
r = run([{ atraso: 1, rec: 65 }, { atraso: 0, rec: 70 }], 'es');
ok('sigue decidiendo igual que siempre', /entrena|suave|descans/i.test(r.title), r.title);

console.log('\nLo mismo en ingles');
r = run([{ atraso: 0, rec: 70 }, { atraso: -1, rec: null }], 'en');
ok('decide en ingles', !/Waiting for your numbers/.test(r.title) && r.title.length > 3, r.title);

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
