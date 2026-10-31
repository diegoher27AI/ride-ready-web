// Prueba que el plan que escribe el entrenador mande sobre las reglas del codigo, que las
// metas se vean, y que los ajustes por dia funcionen tambien en dias futuros.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const HOY = iso(0), MANANA = iso(1);

const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});
// Recuperacion 80%: por reglas daria "sesion planificada" sin pasos propios.
const w = []; for (let i = 45; i >= 0; i--) w.push({ date: iso(-i), recovery: 80, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.5, need_h: 8 });
data.whoop = w;
const acts = []; for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ date: iso(-i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
data.activities = acts;
const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
let fit = 0, fat = 0; const pmc = []; const days = []; for (let i = 45; i >= 0; i--) days.push(iso(-i));
const loads = days.map((d) => byDate.get(d) || 0);
days.forEach((date, i) => {
  fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
  const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
  const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
  const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
  pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
});
data.pmc = pmc;
data.zones = [{ weight_kg: 85.5, ftp_w: 250, ftp_wkg: 2.92, hr_max: 196, device: 'intervals.icu',
  power_zones: [{ label: 'Z1 Recovery', min: 0, max: 137 }, { label: 'Z2 Endurance', min: 138, max: 187 }],
  heart_rate_zones: [{ label: 'Z1 Recovery', min: 0, max: 127 }, { label: 'Z2 Endurance', min: 128, max: 158 }] }];

// Lo que el entrenador escribio: hoy sweet spot, manana el fondo de 4 horas.
data.plan = [
  { date: HOY, decision: 'entrenar', title: 'Sweet spot 3x12', purpose: 'Construir hacia Haute Route.', note: 'Vas bien de frescura.', source: 'ai',
    steps: [
      { name: 'Calentamiento', min: 15, int: 'warmup', p: [120, 160], hr: [100, 130] },
      { name: 'Sweet spot 1', min: 12, int: 'active', p: [210, 225], hr: [150, 162] },
      { name: 'Recuperacion', min: 5, int: 'recovery', p: [110, 140], hr: null },
      { name: 'Sweet spot 2', min: 12, int: 'active', p: [210, 225], hr: [150, 162] },
      { name: 'Enfriamiento', min: 10, int: 'cooldown', p: [100, 130], hr: null },
    ] },
  { date: MANANA, decision: 'entrenar', title: 'Fondo 4 horas', purpose: 'Resistencia larga.', source: 'ai',
    steps: [{ name: 'Fondo en zona 2', min: 240, int: 'active', p: [150, 185], hr: [128, 158] }] },
];
data.goals = [{ name: 'Haute Route Alps', date: iso(290), priority: 'A', notes: '7 etapas de montana' }];

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
window.eval(`window.__view = ${JSON.stringify(view)};
  window.localStorage.setItem('rr_lang','es');
  window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
    onData: (f) => { window.__cb = f; }, params: () => ({lang:'es'}), setParams: () => {}, refresh: () => { window.__reloaded = true; }, loader: () => {}, setLink: () => {}, colors: [] };
  window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
  window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ok:true}), signedIn: () => true, chat: async () => ({text:'ok'}) };
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({data:{},error:null}) } }) };`);
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
window.eval(m[1]);
window.__cb && window.__cb();

const doc = window.document;
const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : '(no existe)'; };
const coach = window.rrCoach;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n); } };

console.log('El plan del entrenador manda sobre las reglas:');
ok('muestra la sesion que escribio el entrenador', /Sweet spot 3x12/.test(q('wk-title')));
ok('con sus pasos, no los de las reglas', /Sweet spot 1/.test(q('wk-steps')));
ok('con sus vatios', /210–225 W/.test(q('wk-steps')));
ok('dice para que sirve', /Haute Route/.test(q('wk-purpose')));
ok('y por que va asi hoy', /frescura/i.test(q('wk-purpose')));
ok('dura lo que sumo el entrenador (54 min)', /54 min/.test(q('wk-meta')));

console.log('\nLa semana muestra lo planificado:');
ok('manana aparece como entrenar', /Entrenar/.test(q('week')));

console.log('\nLas metas:');
ok('aparece la meta real', /Haute Route Alps/.test(q('races')));
ok('con su cuenta regresiva', /29[0-9] |290/.test(q('races')) || /\b29\d\b/.test(q('races')));
ok('no quedan metas de ejemplo', !/Gran Fondo/i.test(q('races')));

console.log('\nLos proximos dias salen del plan, no del ejemplo:');
ok('aparece el fondo de manana', /Fondo 4 horas/.test(q('plan')));
ok('no quedan dias de ejemplo', !/Example/i.test(q('plan')));

console.log('\nAjustes por dia:');
const mins = () => { const m = q('wk-meta').match(/(\d+) min/); return m ? +m[1] : null; };
coach.apply({ day: HOY, mins: 30 });
const got = mins();
// No siempre puede dar el numero exacto: nunca deja un bloque de menos de 5 min ni un
// calentamiento de menos de 4. Lo que importa es que se acerque y respete esos minimos.
ok(`ajustar hoy a 30 min acorta la sesion (quedo en ${got})`, got != null && got < 54 && Math.abs(got - 30) <= 4);
ok('la sesion sigue siendo la del entrenador', /Sweet spot 3x12/.test(q('wk-title')));
ok('ningun bloque quedo en menos de 5 min', !/\b[1-4] min\b/.test(q('wk-steps')));
coach.apply({ day: MANANA, skip: true });
ok('marcar manana como libre no toca hoy', mins() === got);
ok('y manana sale como libre en la semana', /Libre/.test(q('week')));
coach.apply({ day: HOY, reset: true });
ok('volver al plan deshace solo hoy', !/30 min/.test(q('wk-meta')) && /54 min/.test(q('wk-meta')));
ok('manana sigue libre', /Libre/.test(q('week')));

console.log('\nCuando el entrenador guarda plan o metas, la app recarga:');
window.__reloaded = false; coach.reload();
ok('reload pide los datos al servidor', window.__reloaded === true);

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
