// Abre public/index.html en un navegador de prueba y reporta errores reales de la app.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = '/Users/juanhernandez/Library/CloudStorage/OneDrive-Personal/App/RIDE READY APP/ride-ready-web/public';
const SCENARIO = process.argv[2] || 'ejemplo';
const LANG = process.argv[3] || 'es';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { const m = a.join(' '); if (!/Could not parse CSS|Error: Not implemented/.test(m)) errors.push('warn: ' + m); });

// Datos: 'ejemplo' usa public/data tal cual; 'real' simula una cuenta con datos propios.
const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});

function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

if (SCENARIO === 'real') {
  // Recuperacion baja de hoy + VFC caida: debe dar descanso y explicar por que.
  const w = [];
  for (let i = 60; i >= 0; i--) {
    w.push({ date: isoDaysAgo(i), recovery: i === 0 ? 37 : 60 + (i % 20), hrv: i === 0 ? 35 : 50, hrv_30d: 50, rhr: i === 0 ? 63 : 55, rhr_30d: 55, asleep_h: 7, hrv_7d: 48, rhr_7d: 56 });
  }
  data.whoop = w;
  const acts = [];
  for (let i = 40; i >= 1; i--) if (i % 3) acts.push({ date: isoDaysAgo(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 50, calories: 600, avg_hr: 130, max_hr: 160, avg_watts: 150 });
  data.activities = acts;
}
if (SCENARIO === 'vacio') { Object.keys(data).forEach((k) => { data[k] = []; }); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  virtualConsole: vc,
  pretendToBeVisual: true,
  url: 'https://example.test/',
});
const { window } = dom;

// Sustituye la capa de datos (adapter.js) por una que entrega los datos de la prueba.
const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
window.eval(`window.__view = ${JSON.stringify(view)};`);
window.eval(`
  window.localStorage.setItem('rr_lang', ${JSON.stringify(LANG)});
  window.dash = {
    data: (id) => (window.__view[id] && window.__view[id].length ? { status: 'ok', data: window.__view[id] } : { status: 'missing', data: [] }),
    onData: (f) => { window.__cb = f; },
    params: () => ({ lang: ${JSON.stringify(LANG)} }),
    setParams: () => {},
    refresh: () => {},
    loader: () => {}, setLink: () => {}, colors: []
  };
  window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => {}, signInWithOtp: async () => ({}), verifyOtp: async () => ({}), signOut: async () => ({}) },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
  }) };
`);

// d3 y los scripts de la app, en el mismo orden que la pagina.
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { errors.push(`fallo al cargar ${f}: ${e.message}`); }
});

// El panel va embebido en index.html: se saca y se corre.
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
try { window.eval(m[1]); } catch (e) { errors.push('fallo del panel: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); }

// Dispara el dibujado y recorre las cuatro pestañas.
try { if (window.__cb) window.__cb(); } catch (e) { errors.push('fallo al dibujar: ' + e.message); }
['tab-today', 'tab-trends', 'tab-history', 'tab-model'].forEach((id) => {
  const b = window.document.getElementById(id);
  if (!b) { errors.push('falta la pestaña ' + id); return; }
  try { b.click(); } catch (e) { errors.push(`fallo en ${id}: ${e.message}`); }
});

const q = (id) => { const e = window.document.getElementById(id); return e ? (e.textContent || '').trim() : '(no existe)'; };
const out = {
  escenario: SCENARIO, idioma: LANG,
  titulo: q('hdr-title'), sub: q('hdr-sub').slice(0, 150), pastilla: q('pill'),
  mascota: q('pet-name') + ' / ' + q('pet-badge'), dice: q('pet-say').slice(0, 90),
  regla: q('rule').replace(/\s+/g, ' ').slice(0, 120), zonas: q('zone-cap'),
  errores: errors,
};
console.log(JSON.stringify(out, null, 1));
process.exit(errors.length ? 1 : 0);

// Como correrlo:
//   cd /tmp && mkdir -p rr_test && cd rr_test && npm init -y && npm install jsdom
//   node <ruta>/pruebas/abrir-la-app.js [ejemplo|real|vacio] [es|en]
// Abre public/index.html de verdad, recorre las cuatro pestañas y falla si hay errores.
