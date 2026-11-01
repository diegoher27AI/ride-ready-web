// El entrenador arma el plan de varios dias, pero en la tarjeta de hoy no habia forma
// de abrirlos: los botones de dia solo salian si habia mas de una sesion, y la lista
// nunca pasaba de hoy. Ahora se puede tocar cada dia y ver su entrenamiento.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const paso = (name, min, lo, hi, int) => ({ name, min, int: int || 'active', p: [lo, hi], hr: null });

// PLAN: los dias que dejo armados el entrenador. REC: la recuperacion de hoy.
function run(PLAN, REC, lang = 'es') {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(i), recovery: i === 0 ? REC : 66, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.3, need_h: 8 });
  data.whoop = w;
  const acts = []; for (let i = 45; i >= 2; i--) if (i % 3) acts.push({ source: 'intervals.icu', date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
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
  data.plan = PLAN;
  // Zonas como las de un ciclista de verdad. Con una sola zona (como estaba antes esta
  // prueba) todos los pasos caen en la misma y el pulso sale plano por fuerza.
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 196, device: 'intervals.icu',
    power_zones: [
      { label: 'Z1 Recovery', min: 0, max: 137 },
      { label: 'Z2 Endurance', min: 138, max: 187 },
      { label: 'Z3 Tempo', min: 188, max: 225 },
      { label: 'Z4 Threshold', min: 226, max: 262 },
      { label: 'Z5 VO2', min: 263, max: null },
    ],
    heart_rate_zones: [
      { label: 'Z1 Recovery', min: 0, max: 127 },
      { label: 'Z2 Endurance', min: 128, max: 150 },
      { label: 'Z3 Tempo', min: 151, max: 165 },
      { label: 'Z4 Threshold', min: 166, max: 178 },
      { label: 'Z5 VO2', min: 179, max: null },
    ] }];

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
  const botones = () => [...doc.querySelectorAll('#sess-days button')].map((b) => b.textContent.trim());
  // Los recuadros de "Esta semana" de arriba.
  const semana = () => [...doc.querySelectorAll('#week .day')].map((d) => ({
    txt: (d.textContent || '').replace(/\s+/g, ' ').trim(),
    tocable: d.classList.contains('tap'),
    viendo: d.classList.contains('viendo'),
    el: d,
  }));
  const tocarSemana = (i) => { const d = semana()[i]; if (!d) return false; d.el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true; };
  const modo = (cual) => {
    const b = [...doc.querySelectorAll('#mode button')].find((x) => (x.dataset.mode || '') === cual);
    if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  const alturas = () => [...doc.querySelectorAll('#wk-chart rect')].map((r) => Math.round(+r.getAttribute('height')));
  const tocar = (i) => { const b = [...doc.querySelectorAll('#sess-days button')][i]; if (!b) return false; b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true; };
  return { q, botones, tocar, semana, tocarSemana, modo, alturas, doc };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

const PLAN = [
  { date: iso(-1), decision: 'entrenar', title: 'Series de umbral', purpose: 'Subir el umbral.', steps: [paso('Calentamiento', 15, 120, 150, 'warmup'), paso('4 x 8 min', 40, 230, 250), paso('Enfriamiento', 10, 100, 130, 'cooldown')] },
  { date: iso(-2), decision: 'descanso', title: 'Descanso', purpose: 'Dejar asentar la carga.', steps: [] },
  { date: iso(-3), decision: 'entrenar', title: 'Fondo largo', purpose: 'Resistencia aerobica.', steps: [paso('Zona 2', 180, 150, 190)] },
];

console.log('Con plan armado hacia adelante:');
let r = run(PLAN, 54);
console.log('   botones:', r.botones().join(' | '));
ok('aparecen los botones de dia', r.botones().length >= 4, r.botones().length);
ok('el primero es Hoy', /Hoy/.test(r.botones()[0]), r.botones()[0]);
ok('estan los 3 dias planificados', r.botones().length === 4, r.botones().join('|'));
const hoyTitulo = r.q('wk-title');
ok('arranca mostrando hoy', /suave/i.test(hoyTitulo), hoyTitulo);

console.log('\nTocar el dia de manana:');
r.tocar(1);
ok('cambia el titulo al del plan', /umbral/i.test(r.q('wk-title')), r.q('wk-title'));
ok('muestra los pasos de ese dia', /8 min/.test(r.q('wk-steps')), r.q('wk-steps').slice(0, 80));
ok('muestra los vatios del plan', /230/.test(r.q('wk-steps')), r.q('wk-steps').slice(0, 80));
ok('el rotulo ya no dice Hoy', !/^Hoy$/.test(r.q('wk-eyebrow')), r.q('wk-eyebrow'));
ok('el proposito es el del plan', /umbral/i.test(r.q('wk-purpose')), r.q('wk-purpose').slice(0, 60));

console.log('\nTocar un dia de descanso:');
r.tocar(2);
ok('dice que es descanso', /descanso/i.test(r.q('wk-title')), r.q('wk-title'));
ok('no inventa pasos', r.q('wk-steps').length < 5, r.q('wk-steps').slice(0, 50));

console.log('\nTocar el fondo largo:');
r.tocar(3);
ok('muestra el fondo', /fondo/i.test(r.q('wk-title')), r.q('wk-title'));
ok('con sus 180 min', /180 min/.test(r.q('wk-meta') + r.q('wk-steps')), r.q('wk-meta'));

console.log('\nVolver a hoy:');
r.tocar(0);
ok('vuelve a la sesion de hoy', /suave/i.test(r.q('wk-title')), r.q('wk-title'));
ok('y el rotulo dice Hoy', /^Hoy$/.test(r.q('wk-eyebrow')), r.q('wk-eyebrow'));

console.log('\nHoy sin sesion propia (recuperacion verde) pero con plan adelante:');
r = run(PLAN, 72);
console.log('   botones:', r.botones().join(' | '));
ok('igual se pueden ver los dias de adelante', r.botones().length >= 4, r.botones().length);
r.tocar(1);
ok('y se abren bien', /umbral/i.test(r.q('wk-title')), r.q('wk-title'));

console.log('\nSin plan: no aparecen botones de mas');
r = run([], 54);
ok('no hay botones sueltos', r.botones().length === 0, r.botones().join('|'));
ok('pero si la sesion de hoy', /suave/i.test(r.q('wk-title')), r.q('wk-title'));

console.log('\nEn ingles:');
r = run(PLAN, 54, 'en');
ok('el primer boton dice Today', /Today/.test(r.botones()[0]), r.botones()[0]);

console.log('\nLos dias de "Esta semana" se pueden tocar:');
r = run(PLAN, 54);
{
  const dias = r.semana();
  console.log('   ', dias.map((d) => d.txt.slice(0, 14) + (d.tocable ? ' [tocable]' : '')).join(' | '));
  ok('hay 7 recuadros', dias.length === 7, dias.length);
  ok('hoy se puede tocar', dias[3].tocable, dias[3].txt);
  ok('los dias planificados se pueden tocar', dias[4].tocable && dias[5].tocable && dias[6].tocable);
  ok('los dias pasados NO se tocan', !dias[0].tocable && !dias[1].tocable && !dias[2].tocable);
  ok('hoy arranca marcado como el que se ve', dias[3].viendo, dias.map((d) => d.viendo).join(','));
}

console.log('\nTocar el dia de manana desde "Esta semana":');
{
  r.tocarSemana(4);
  ok('la tarjeta de abajo cambia a ese dia', /umbral/i.test(r.q('wk-title')), r.q('wk-title'));
  ok('el recuadro de arriba queda marcado', r.semana()[4].viendo, r.semana().map((d) => d.viendo).join(','));
  ok('y hoy ya no', !r.semana()[3].viendo);
  ok('los botones de abajo siguen en el mismo dia', /umbral/i.test(r.q('wk-title')));
}

console.log('\nTocar el fondo largo, y volver a hoy:');
{
  r.tocarSemana(6);
  ok('muestra el fondo', /fondo/i.test(r.q('wk-title')), r.q('wk-title'));
  r.tocarSemana(3);
  ok('vuelve a hoy', /suave/i.test(r.q('wk-title')), r.q('wk-title'));
  ok('y hoy queda marcado', r.semana()[3].viendo);
}

console.log('\nEl pulso sale de tus zonas, no de un 175 fijo:');
{
  r = run(PLAN, 54);
  r.tocarSemana(4);          // el dia de series, que tiene 3 pasos distintos
  r.modo('power');
  const pot = r.alturas();
  r.modo('hr');
  const pul = r.alturas();
  console.log('   alturas en potencia:', pot.join(','), '| en pulso:', pul.join(','));
  ok('en potencia se ven barras distintas', new Set(pot).size > 1, pot.join(','));
  ok('en pulso TAMBIEN se ven distintas', new Set(pul).size > 1, pul.join(','));
  ok('el bloque fuerte es el mas alto en pulso', pul[1] === Math.max(...pul), pul.join(','));
  const pasos = r.q('wk-steps');
  ok('los pasos muestran lpm, no "RPE 8"', /lpm|bpm/.test(pasos), pasos.slice(0, 100));
  ok('y no todos el mismo numero', new Set((pasos.match(/\d+–\d+/g) || [])).size > 1, pasos.slice(0, 120));
}

console.log('\nSin zonas de pulso no se inventa un numero:');
{
  const sinZonas = run(PLAN, 54);
  sinZonas.doc.defaultView.eval("window.__view.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, power_zones: '[]', heart_rate_zones: '[]' }]; window.__cb && window.__cb();");
  sinZonas.tocarSemana(4);
  sinZonas.modo('hr');
  ok('dice que vaya por sensacion', /RPE/.test(sinZonas.q('wk-steps')), sinZonas.q('wk-steps').slice(0, 90));
}

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
