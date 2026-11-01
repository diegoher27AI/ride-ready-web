// Antes la unica forma de poner una meta era decirsela al entrenador en el chat, y no
// se notaba que se podia. Ahora hay un boton + con su formulario: nombre, fechas (una
// o un rango si el evento dura varios dias), distancia, desnivel e importancia.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// METAS: las que ya estan guardadas. CUENTA: si hay sesion iniciada.
function run({ METAS = [], CUENTA = true, RESPUESTA_IA = 'La Haute Route Alps son 7 etapas de alta montaña.', lang = 'es' } = {}) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(-i), recovery: 68, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: null });
  data.whoop = w;
  const acts = []; for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ source: 'intervals.icu', date: iso(-i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
  data.activities = acts;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const dias = []; for (let i = 45; i >= 0; i--) dias.push(iso(-i));
  let fit = 0, fat = 0; const pmc = []; const loads = dias.map((d) => byDate.get(d) || 0);
  dias.forEach((date, i) => {
    fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
    const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
    const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
    const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
    pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
  });
  data.pmc = pmc;
  data.goals = METAS;
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 192, device: 'intervals.icu',
    power_zones: [{ label: 'Z2', min: 138, max: 187 }], heart_rate_zones: [{ label: 'Z2', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','${lang}');
    window.__guardadas = []; window.__borradas = []; window.__preguntas = [];
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'${lang}'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, savePerfil: () => true, clear: () => {} };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'modelo.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  window.eval(`window.rrAccount = {
    signedIn: () => ${CUENTA}, syncNow: async () => ({}), sendWorkout: async () => ({ok:true}),
    planSemanal: async () => ({ ok: true, saltado: true }),
    guardarMeta: async (m) => { window.__guardadas.push(m); return Object.assign({ id: 'g1' }, m); },
    borrarMeta: async (id) => { window.__borradas.push(id); return true; },
    investigarMeta: async (m) => { window.__preguntas.push(m); return ${JSON.stringify(RESPUESTA_IA)}; },
  };`);
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  const clic = (e) => { if (e) e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return !!e; };
  return {
    doc, window, q, clic,
    mas: () => doc.querySelector('.meta-mas'),
    abrir: () => clic(doc.querySelector('.meta-mas')),
    campo: (id, v) => { const e = doc.getElementById(id); if (e) e.value = v; return !!e; },
    guardar: () => clic([...doc.querySelectorAll('.meta-btn')].find((b) => !b.classList.contains('ghost'))),
    preguntar: () => clic(doc.querySelector('.meta-btn.ghost')),
    quitar: () => clic(doc.querySelector('.meta-quitar')),
    metas: () => q('races'),
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms || 40));
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

(async () => {
  console.log('Sin metas todavia:');
  let r = run({ METAS: [] });
  ok('hay un boton +', !!r.mas());
  ok('dice que toques + para agregar', /Toca \+/.test(r.metas()), r.metas().slice(0, 90));

  console.log('\nAbrir el formulario:');
  r.abrir();
  ok('se abre', !!r.doc.getElementById('meta-sheet'));
  ok('pide el nombre', !!r.doc.getElementById('meta-n'));
  ok('pide fecha de inicio', !!r.doc.getElementById('meta-d1'));
  ok('pide fecha de fin para varios dias', !!r.doc.getElementById('meta-d2'));
  ok('pide distancia y desnivel', !!r.doc.getElementById('meta-km') && !!r.doc.getElementById('meta-m'));
  ok('pide que tan importante es', !!r.doc.getElementById('meta-p'));

  console.log('\nNo deja guardar cualquier cosa:');
  r.guardar(); await esperar();
  ok('sin nombre no guarda', r.window.__guardadas.length === 0, r.window.__guardadas.length);
  ok('y lo dice', /nombre/i.test(r.q('meta-st')), r.q('meta-st'));
  r.campo('meta-n', 'Haute Route Alps'); r.guardar(); await esperar();
  ok('sin fecha tampoco', r.window.__guardadas.length === 0);
  ok('y lo dice', /fecha/i.test(r.q('meta-st')), r.q('meta-st'));
  r.campo('meta-d1', iso(-30)); r.guardar(); await esperar();
  ok('una fecha pasada tampoco', r.window.__guardadas.length === 0);
  ok('y lo dice', /pasó/i.test(r.q('meta-st')), r.q('meta-st'));

  console.log('\nUn evento de varios dias:');
  r.campo('meta-d1', iso(120)); r.campo('meta-d2', iso(126));
  r.campo('meta-km', '800'); r.campo('meta-m', '21000'); r.campo('meta-notas', 'Alta montaña.');
  r.guardar(); await esperar(80);
  const g = r.window.__guardadas[0];
  ok('ahora si guarda', !!g, r.q('meta-st'));
  ok('guarda el nombre', g.name === 'Haute Route Alps', g.name);
  ok('guarda las dos fechas', g.goal_date === iso(120) && g.end_date === iso(126), `${g.goal_date} a ${g.end_date}`);
  ok('guarda la distancia', g.distance_km === 800, g.distance_km);
  ok('guarda el desnivel', g.climb_m === 21000, g.climb_m);
  ok('guarda la importancia', g.priority === 'A', g.priority);
  ok('guarda las notas', /Alta montaña/.test(g.notes), g.notes);
  ok('cierra el formulario', !r.doc.getElementById('meta-sheet'));

  console.log('\nUna fecha de fin anterior al inicio se ignora:');
  r = run({ METAS: [] }); r.abrir();
  r.campo('meta-n', 'Gran fondo'); r.campo('meta-d1', iso(60)); r.campo('meta-d2', iso(50));
  r.guardar(); await esperar(80);
  ok('no guarda un rango al reves', r.window.__guardadas[0].end_date === null, r.window.__guardadas[0].end_date);

  console.log('\nPreguntarle al entrenador por el evento:');
  r = run({ METAS: [] }); r.abrir();
  r.campo('meta-n', 'Haute Route Alps'); r.campo('meta-d1', iso(120));
  r.preguntar(); await esperar(80);
  ok('le pregunta', r.window.__preguntas.length === 1, r.window.__preguntas.length);
  ok('le manda el nombre y la fecha', r.window.__preguntas[0].name === 'Haute Route Alps' && !!r.window.__preguntas[0].goal_date);
  ok('muestra lo que contesto', /7 etapas/.test(r.q('meta-st')), r.q('meta-st').slice(0, 80));
  r.guardar(); await esperar(80);
  // Lo que sabe el entrenador va en su propia columna, no mezclado con tus notas:
  // asi se puede mostrar aparte y queda claro que lo escribio la IA, no vos.
  ok('y lo guarda aparte de tus notas', /7 etapas/.test(r.window.__guardadas[0].sabe_ia || ''), r.window.__guardadas[0].sabe_ia);
  ok('sin ensuciar tus notas', !r.window.__guardadas[0].notes, r.window.__guardadas[0].notes);

  console.log('\nSi el entrenador NO conoce el evento, se guarda igual:');
  r = run({ METAS: [], RESPUESTA_IA: 'No reconozco ese evento. Decime distancia y desnivel.' });
  r.abrir(); r.campo('meta-n', 'Vuelta a Turrialba'); r.campo('meta-d1', iso(90));
  r.preguntar(); await esperar(80);
  ok('muestra que no lo conoce, sin inventar', /No reconozco/.test(r.q('meta-st')), r.q('meta-st'));

  console.log('\nUna meta ya guardada se ve y se puede quitar:');
  r = run({ METAS: [{ id: 'g9', name: 'Haute Route Alps', date: iso(120), end_date: iso(126), priority: 'A', distance_km: 800, climb_m: 21000, notes: 'Alta montaña.' }] });
  const txt = r.metas();
  console.log('   ', txt.slice(0, 130));
  ok('se ve el nombre', /Haute Route Alps/.test(txt), txt.slice(0, 60));
  ok('se ven las dos fechas', /–/.test(txt), txt.slice(0, 120));
  ok('se ve la distancia y el desnivel', /800 km/.test(txt) && /21000 m|21,000 m/.test(txt), txt.slice(0, 140));
  ok('se ven los dias que faltan', /120/.test(txt), txt.slice(0, 60));
  r.quitar(); await esperar(80);
  ok('se puede quitar', r.window.__borradas[0] === 'g9', r.window.__borradas.join(','));

  console.log('\nSin cuenta iniciada no se ofrece agregar:');
  r = run({ METAS: [], CUENTA: false });
  ok('no hay boton +', !r.mas());

  console.log('\nEn ingles:');
  r = run({ METAS: [], lang: 'en' }); r.abrir();
  ok('el formulario esta en ingles', /New goal/.test(r.q('meta-sheet')), r.q('meta-sheet').slice(0, 60));

  console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
  if (errors.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
