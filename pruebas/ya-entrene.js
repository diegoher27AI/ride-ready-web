// Si hoy ya hubo entrenamiento, la app no puede hacer como si no hubiera pasado nada.
// El gato decia "listo para darle" con la salida de la manana ya cargada.
// El titular, la tarjeta y el gato tienen que decir lo mismo entre si.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// HOY: la salida de hoy, o null. REC: recuperacion de hoy.
function run(HOY, REC, lang = 'es') {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(i), recovery: i === 0 ? REC : 68, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.4, need_h: 8 });
  data.whoop = w;
  const acts = [];
  for (let i = 45; i >= 2; i--) if (i % 3) acts.push({ source: 'intervals.icu', date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
  if (HOY) acts.push({ source: 'intervals.icu', date: iso(0), name: 'Ride', sport: 'Ride', distance_km: 20, calories: 500, avg_hr: 135, max_hr: 165, avg_watts: 160, ...HOY });
  data.activities = acts;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + (a.relative_effort || 0)));
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
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 196, device: 'intervals.icu',
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
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  return { title: q('hdr-title'), sub: q('hdr-sub'), gato: q('pet-say'), badge: q('pet-badge') };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

console.log('Su caso de hoy: recuperacion 70 y ya hizo 90 min');
let r = run({ moving_min: 90, relative_effort: 75 }, 70);
console.log('   gato  :', r.gato);
console.log('   titular:', r.sub.slice(0, 120));
ok('el gato NO dice "listo para darle"', !/Listo para|a tope/i.test(r.gato), r.gato);
ok('el gato reconoce lo hecho', /90 min/.test(r.gato), r.gato);
ok('el gato manda a descansar', /cumplimos|descansar/i.test(r.gato), r.gato);
ok('el titular tambien lo dice', /ya entrenaste hoy/i.test(r.sub), r.sub.slice(0, 120));
ok('el titular no pide otra sesion', !/Sesión planificada/.test(r.sub), r.sub.slice(0, 120));
ok('no se contradicen', !(/descansar/i.test(r.gato) && /Sesión planificada/.test(r.sub)));

console.log('\nSalida corta de 40 min y muy fresco: puede quedar margen');
r = run({ moving_min: 40, relative_effort: 25 }, 85);
console.log('   gato  :', r.gato);
ok('reconoce los 40 min', /40 min/.test(r.gato), r.gato);
ok('no manda a parar del todo', /piernas|más|mas/i.test(r.gato), r.gato);
ok('y pide mantenerlo aerobico', /aeróbico|aerobico/i.test(r.gato), r.gato);

console.log('\nTodavia no entreno hoy: todo sigue como antes');
r = run(null, 70);
console.log('   gato  :', r.gato);
ok('el gato si invita a entrenar', /Listo para|a tope|pedalear/i.test(r.gato), r.gato);
ok('el titular no dice que ya entrenaste', !/ya entrenaste hoy/i.test(r.sub), r.sub.slice(0, 100));

console.log('\nEntreno hoy pero tocaba descansar (recuperacion 25)');
r = run({ moving_min: 90, relative_effort: 90 }, 25);
console.log('   gato  :', r.gato);
ok('el gato lo marca como error, no lo felicita', /descansar|cansado/i.test(r.gato), r.gato);
ok('no dice que todavia quedan piernas', !/piernas/i.test(r.gato), r.gato);

console.log('\nUn paseo no cuenta como entrenamiento');
r = run({ moving_min: 20, relative_effort: 3, sport: 'Walk', name: 'Caminata' }, 70);
ok('el gato sigue invitando a entrenar', !/cumplimos/i.test(r.gato), r.gato);
ok('el titular no dice que ya entrenaste', !/ya entrenaste hoy/i.test(r.sub), r.sub.slice(0, 100));

console.log('\nEn ingles');
r = run({ moving_min: 90, relative_effort: 75 }, 70, 'en');
ok('el gato en ingles reconoce lo hecho', /90 min done today/i.test(r.gato), r.gato);
ok('el titular en ingles tambien', /already trained today/i.test(r.sub), r.sub.slice(0, 110));

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
