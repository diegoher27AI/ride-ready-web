// La regla que no se negocia: si el ciclista tiene datos suyos, NINGUNA pantalla
// puede mostrarle numeros del ciclista de ejemplo. Antes se colaban en los proximos
// dias, las metas, el cumplimiento del plan y toda la pestaña Modelo.
// Sin cuenta conectada el ejemplo si vale, como vista previa.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// PROPIO: si la cuenta esta conectada con datos del ciclista.
function run(PROPIO, lang = 'es') {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  if (PROPIO) {
    const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(i), recovery: 70, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: 8 });
    data.whoop = w;
    const acts = []; for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ source: 'intervals.icu', date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
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
    data.power = [];     // sin potenciometro
    data.monthly = [{ month: iso(0).slice(0, 7), sessions: 10, hours: 12, relative_effort_total: 500, calories_total: 6000 }];
  }

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
    window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), signedIn: () => ${PROPIO} };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  // Recorrer las cuatro pestañas, como haria el ciclista.
  const textos = {};
  ['today', 'trends', 'history', 'model'].forEach((pg) => {
    const b = doc.getElementById('tab-' + pg);
    if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const sec = doc.getElementById(pg);
    textos[pg] = sec ? visible(sec) : '';
  });
  // Solo lo que de verdad se ve: las tarjetas escondidas no cuentan.
  function visible(nodo) {
    let out = '';
    nodo.querySelectorAll('*').forEach(() => {});
    const anda = (n) => {
      if (n.nodeType === 3) { out += n.textContent + ' '; return; }
      if (n.nodeType !== 1) return;
      if (n.hidden) return;
      n.childNodes.forEach(anda);
    };
    anda(nodo);
    return out.replace(/\s+/g, ' ');
  }
  return { textos, doc, window };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

// Huellas inconfundibles del ciclista de ejemplo.
const HUELLAS = [
  ['el dia de ejemplo', /Dia de ejemplo|Example day/i],
  ['el plan de muestra', /plan de muestra|demo plan/i],
  ['la temporada de ejemplo', /temporada de ejemplo|Example season/i],
  ['la meta de ejemplo', /Meta de ejemplo|Example goal/i],
  ['el dia de descanso de ejemplo', /descanso de ejemplo/i],
];

console.log('CON datos propios: nada del ejemplo puede verse');
let r = run(true);
['today', 'trends', 'history', 'model'].forEach((pg) => {
  HUELLAS.forEach(([nombre, re]) => {
    ok(`${pg}: sin ${nombre}`, !re.test(r.textos[pg]), (r.textos[pg].match(re) || [''])[0]);
  });
});
ok('la pestaña Modelo avisa en vez de mentir', /Tu modelo todavía no existe/.test(r.textos.model), r.textos.model.slice(0, 80));
ok('el pronostico del ejemplo no se ve', !/predicho|predicted/i.test(r.textos.model), r.textos.model.slice(0, 80));
ok('el cumplimiento del ejemplo no se ve', !/¿Seguí el plan\?/.test(r.textos.history));
ok('sin plan, lo dice', /Todavía no hay plan/.test(r.textos.today), r.textos.today.slice(0, 100));
ok('sin metas, lo dice', /Todavía no hay metas/.test(r.textos.today));
ok('sin potenciometro, no hay tarjeta de potencia', !/W\/kg mejor 5 min/.test(r.textos.trends));
ok('pero si se ve lo que SI es suyo (forma fisica)', /Forma física|forma física/i.test(r.textos.today + r.textos.trends));

console.log('\nSIN cuenta: el ejemplo si vale como vista previa');
r = run(false);
const todo = Object.values(r.textos).join(' ');
ok('se ve contenido de ejemplo', HUELLAS.some(([, re]) => re.test(todo)));
ok('la pestaña Modelo muestra sus tarjetas', !/Tu modelo todavía no existe/.test(r.textos.model));
ok('no queda ninguna pestaña vacia', ['today', 'trends', 'history', 'model'].every((p) => r.textos[p].length > 200),
  ['today', 'trends', 'history', 'model'].map((p) => p + ':' + r.textos[p].length).join(' '));

console.log('\nEn ingles, con datos propios');
r = run(true, 'en');
ok('la pestaña Modelo avisa en ingles', /model is not built yet/i.test(r.textos.model), r.textos.model.slice(0, 70));
ok('sin huellas del ejemplo', !HUELLAS.some(([, re]) => re.test(Object.values(r.textos).join(' '))));

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
