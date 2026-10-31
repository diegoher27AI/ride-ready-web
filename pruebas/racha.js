// "Dias sin descanso" y el resumen del año salian de los datos de EJEMPLO, no de las
// actividades del ciclista. El "maximo del año: 20" estaba ademas escrito a mano.
// Juan Diego vio "7 dias sin descanso" cuando llevaba dias sin entrenar seguido.
// Aqui se comprueba que ambos numeros salgan de sus propias actividades.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// ATRASOS = en que dias (dias de atraso) hubo entrenamiento de verdad.
function run(ATRASOS, lang) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = [];
  for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(i), recovery: 70, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: 8 });
  data.whoop = w;
  data.activities = ATRASOS.map((n) => ({ date: iso(n), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 }));

  const byDate = new Map(); data.activities.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const days = []; for (let i = 400; i >= 0; i--) days.push(iso(i));
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
  // La pestaña Historial se dibuja al abrirla, igual que en el telefono.
  const th = doc.getElementById('tab-history');
  if (th) th.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  // El recuadro "Days without rest" / "Dias sin descanso"
  const chip = [...doc.querySelectorAll('#chips .chip')].map((c) => ({
    k: (c.querySelector('.k') || {}).textContent || '', v: (c.querySelector('.v') || {}).textContent || '', d: (c.querySelector('.d') || {}).textContent || '' }))
    .find((c) => /sin descanso|without rest/i.test(c.k)) || null;
  const ytd = [...doc.querySelectorAll('#ytd-chips .chip')].map((c) => ({
    k: (c.querySelector('.k') || {}).textContent || '', v: (c.querySelector('.v') || {}).textContent || '', d: (c.querySelector('.d') || {}).textContent || '' }));
  return { chip, ytd };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

console.log('Su caso: entreno hace 4, 6 y 9 dias (descanso de por medio)');
let r = run([4, 6, 9], 'es');
console.log('   recuadro:', r.chip && `${r.chip.k} = ${r.chip.v} (${r.chip.d})`);
ok('la racha es 0, no 7', r.chip && r.chip.v === '0', r.chip && r.chip.v);
ok('el maximo del año NO es el 20 escrito a mano', r.chip && !/20/.test(r.chip.d), r.chip && r.chip.d);
ok('el maximo del año es 1, su racha mas larga', r.chip && /1$/.test(r.chip.d.trim()), r.chip && r.chip.d);

console.log('\nTres dias seguidos entrenando, terminando hoy');
r = run([0, 1, 2, 5, 7], 'es');
console.log('   recuadro:', r.chip && `${r.chip.v} (${r.chip.d})`);
ok('la racha es 3', r.chip && r.chip.v === '3', r.chip && r.chip.v);
ok('el maximo del año tambien es 3', r.chip && /3$/.test(r.chip.d.trim()), r.chip && r.chip.d);

console.log('\nEntreno ayer y anteayer, hoy todavia no');
r = run([1, 2, 3], 'es');
ok('la racha sigue viva y vale 3', r.chip && r.chip.v === '3', r.chip && r.chip.v);

console.log('\nHace 5 dias que no entrena: la racha ya murio');
r = run([5, 6, 7, 8], 'es');
ok('la racha es 0', r.chip && r.chip.v === '0', r.chip && r.chip.v);
ok('pero recuerda el maximo de 4', r.chip && /4$/.test(r.chip.d.trim()), r.chip && r.chip.d);

console.log('\nRacha larga: 12 dias seguidos, avisa en rojo');
r = run(Array.from({ length: 12 }, (_, i) => i), 'es');
ok('la racha es 12', r.chip && r.chip.v === '12', r.chip && r.chip.v);

console.log('\nEl resumen del año (Historial) sale de sus actividades');
r = run([0, 1, 2, 5, 7], 'es');
const dias = r.ytd.find((c) => /entrenamiento|Training days/i.test(c.k));
const racha = r.ytd.find((c) => /Racha|streak/i.test(c.k));
console.log('   dias de entrenamiento:', dias && dias.v, '| racha mas larga:', racha && racha.v);
ok('cuenta 5 dias de entrenamiento, no 216 del ejemplo', dias && dias.v === '5', dias && dias.v);
ok('la racha mas larga es 3 d, no 14 del ejemplo', racha && /^3 /.test(racha.v), racha && racha.v);

console.log('\nSin actividades: no se inventa nada con el ejemplo');
r = run([], 'es');
ok('no muestra el recuadro de racha', !r.chip, r.chip && r.chip.v);

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
