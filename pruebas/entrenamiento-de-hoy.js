// Simula el caso real de Juan Diego hoy (recuperacion 54%) y muestra que se ve en pantalla.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');
const REC = Number(process.argv[2] || 54);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// Datos reales simulados: 40 dias de bienestar y actividades, como una cuenta conectada.
const w = [];
for (let i = 45; i >= 0; i--) w.push({ date: iso(i), recovery: i === 0 ? REC : 65, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: 8 });
data.whoop = w;
const acts = [];
for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
data.activities = acts;
// pmc calculado como lo hace adapter.js
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
// zonas reales (como vendrian de intervals.icu)
data.zones = [{ weight_kg: 85.5, ftp_w: 250, ftp_wkg: 2.92, hr_max: 196, device: 'intervals.icu',
  power_zones: [{ label: 'Z1 Recovery', min: 0, max: 137 }, { label: 'Z2 Endurance', min: 138, max: 187 }, { label: 'Z3 Tempo', min: 188, max: 225 }],
  heart_rate_zones: [{ label: 'Z1 Recovery', min: 0, max: 127 }, { label: 'Z2 Endurance', min: 128, max: 158 }] }];

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
window.eval(`window.__view = ${JSON.stringify(view)};
  window.localStorage.setItem('rr_lang','es');
  window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
    onData: (f) => { window.__cb = f; }, params: () => ({lang:'es'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
  window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
  window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }) };
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({data:{},error:null}) } }) };`);
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
window.eval(m[1]);
window.__cb && window.__cb();

const doc = window.document;
const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : '(no existe)'; };
console.log('recuperacion simulada :', REC + '%');
console.log('titular               :', q('hdr-title'));
console.log('subtitulo             :', q('hdr-sub').slice(0, 130));
console.log('---');
console.log('entrenamiento (titulo):', q('wk-title'));
console.log('cuando                :', q('wk-eyebrow'));
console.log('proposito             :', q('wk-purpose').slice(0, 120));
console.log('pasos                 :', q('wk-steps').slice(0, 160));
console.log('---');
console.log('semana                :', q('week'));
console.log('boton calendario      :', doc.getElementById('cal-box').hidden ? 'escondido' : 'visible: ' + q('cal-btn'));
console.log('zonas                 :', q('zone-cap'));
console.log('errores               :', errors.length ? errors : 'ninguno');
process.exit(errors.length ? 1 : 0);
