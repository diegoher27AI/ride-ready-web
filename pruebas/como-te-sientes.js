// De donde sale la lectura del dia, en orden de fiabilidad:
//   1. Como dijo el ciclista que se siente. El sabe si durmio mal o anda resfriado.
//   2. La recuperacion de Whoop.
//   3. Lo que da un Garmin: puntuacion de sueno, VFC y pulso en reposo contra su base.
// Y si no hay ninguna, se pregunta en vez de adivinar.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// HOY: lo que hay para el dia de hoy. PROPIO: si la cuenta esta conectada.
function run(HOY, { PROPIO = true, lang = 'es' } = {}) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const marca = PROPIO ? 'intervals.icu' : 'example';
  const w = [];
  // 45 dias de fondo con VFC y pulso estables, para que haya base de 30 dias.
  for (let i = 45; i >= 1; i--) w.push({ source: marca, date: iso(i), recovery: null, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, sleep_score: 70, asleep_h: 7.2 });
  w.push({ source: marca, date: iso(0), hrv_30d: 50, rhr_30d: 55, ...HOY });
  data.whoop = w;
  const acts = []; for (let i = 45; i >= 2; i--) if (i % 3) acts.push({ source: marca, date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
  data.activities = acts;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const dias = []; for (let i = 45; i >= 0; i--) dias.push(iso(i));
  let fit = 0, fat = 0; const pmc = []; const loads = dias.map((d) => byDate.get(d) || 0);
  dias.forEach((date, i) => {
    fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
    const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
    const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
    const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
    pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
  });
  data.pmc = pmc;
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 192, device: 'intervals.icu',
    power_zones: [{ label: 'Z1', min: 0, max: 137 }, { label: 'Z2', min: 138, max: 187 }],
    heart_rate_zones: [{ label: 'Z1', min: 0, max: 127 }, { label: 'Z2', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','${lang}');
    window.__sens = [];
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'${lang}'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, savePerfil: () => true, clear: () => {},
      saveSensacion: (f, v) => { window.__sens.push({ f, v });
        const fila = window.__view.whoop[window.__view.whoop.length - 1];
        if (v == null) delete fila.sensacion; else fila.sensacion = v;
        return true; } };
    window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ok:true}), signedIn: () => ${PROPIO}, planSemanal: async () => ({ok:true,saltado:true}) };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'modelo.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  const visible = (id) => { const e = doc.getElementById(id); return !!e && !e.hidden; };
  const sens = () => [...doc.querySelectorAll('#sens-row button')];
  const tocarSens = (i) => { const b = sens()[i]; if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return !!b; };
  return { q, visible, sens, tocarSens, doc, window };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

console.log('Con Whoop (recuperacion 72):');
let r = run({ recovery: 72, hrv: 50, rhr: 55, sleep_score: 75, asleep_h: 7.4 });
ok('decide con Whoop', /puedes entrenar/i.test(r.q('hdr-title')), r.q('hdr-title'));
ok('dice el porcentaje', /72%/.test(r.q('hdr-sub')), r.q('hdr-sub').slice(0, 70));

console.log('\nSOLO Garmin (sin recuperacion, pero con sueno, VFC y pulso):');
r = run({ recovery: null, hrv: 52, rhr: 54, sleep_score: 82, asleep_h: 7.6 });
console.log('   ', r.q('hdr-title'), '|', r.q('hdr-sub').slice(0, 95));
ok('igual decide, no se queda muda', !/Esperando/.test(r.q('hdr-title')), r.q('hdr-title'));
ok('y dice que fue con el reloj', /tu reloj/i.test(r.q('hdr-sub')), r.q('hdr-sub').slice(0, 90));
ok('menciona el sueno', /sueño 82/.test(r.q('hdr-sub')), r.q('hdr-sub').slice(0, 90));
ok('NO inventa un porcentaje de Whoop', !/Recuperación \d+%/.test(r.q('hdr-sub')), r.q('hdr-sub').slice(0, 90));

console.log('\nGarmin con mal sueno y VFC baja: tiene que bajar el dia');
{
  const bien = run({ recovery: null, hrv: 55, rhr: 53, sleep_score: 88, asleep_h: 8 });
  const mal = run({ recovery: null, hrv: 40, rhr: 61, sleep_score: 35, asleep_h: 5 });
  console.log('   bien:', bien.q('hdr-title'), '| mal:', mal.q('hdr-title'));
  ok('con buen sueno deja entrenar', /entrenar/i.test(bien.q('hdr-title')), bien.q('hdr-title'));
  ok('con mal sueno NO deja entrenar igual', !/puedes entrenar/i.test(mal.q('hdr-title')), mal.q('hdr-title'));
}

console.log('\nSOLO entrenamientos (ni Whoop ni reloj): pregunta');
r = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null });
ok('muestra la pregunta', r.visible('card-sens'));
ok('da cinco opciones', r.sens().length === 5, r.sens().length);
ok('explica que decide el dia', /decide tu día/i.test(r.q('sens-p')), r.q('sens-p'));

console.log('\nContestar cambia el dia de verdad:');
{
  r = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null });
  r.tocarSens(4);        // muy bien
  const bien = r.q('hdr-title');
  console.log('   muy bien ->', bien);
  ok('se guarda lo que dijiste', r.window.__sens.length === 1 && r.window.__sens[0].v === 5, JSON.stringify(r.window.__sens));
  ok('"muy bien" deja entrenar', /entrenar/i.test(bien), bien);
  ok('dice que fue por lo que sentis', /dijiste cómo te sientes/i.test(r.q('hdr-sub')), r.q('hdr-sub').slice(0, 80));

  const r2 = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null });
  r2.tocarSens(0);       // fatal
  console.log('   fatal    ->', r2.q('hdr-title'));
  ok('"fatal" manda a descansar', /descansar/i.test(r2.q('hdr-title')), r2.q('hdr-title'));

  const r3 = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null });
  r3.tocarSens(2);       // normal
  ok('"normal" da rodada suave', /suave/i.test(r3.q('hdr-title')), r3.q('hdr-title'));
}

console.log('\nLo que sientes MANDA sobre el aparato:');
{
  r = run({ recovery: 85, hrv: 55, rhr: 53, sleep_score: 90, asleep_h: 8 });
  ok('con 85% el reloj dice entrenar', /entrenar/i.test(r.q('hdr-title')), r.q('hdr-title'));
  ok('igual te pregunta', r.visible('card-sens'));
  ok('y avisa que lo tuyo manda', /manda lo tuyo/i.test(r.q('sens-p')), r.q('sens-p'));
  r.tocarSens(0);        // me siento fatal
  console.log('   85% pero me siento fatal ->', r.q('hdr-title'));
  ok('decir "fatal" cambia el dia a descanso', /descansar/i.test(r.q('hdr-title')), r.q('hdr-title'));
}

console.log('\nSe puede deshacer:');
{
  r = run({ recovery: 85, hrv: 55, rhr: 53, sleep_score: 90, asleep_h: 8 });
  r.tocarSens(0);
  ok('bajo a descanso', /descansar/i.test(r.q('hdr-title')), r.q('hdr-title'));
  r.tocarSens(0);        // otra vez: deshace
  ok('vuelve a lo que dice el aparato', /entrenar/i.test(r.q('hdr-title')), r.q('hdr-title'));
  ok('y se guarda el deshacer', r.window.__sens.slice(-1)[0].v === null, JSON.stringify(r.window.__sens.slice(-1)));
}

console.log('\nSin cuenta conectada no se pregunta nada:');
r = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null }, { PROPIO: false });
ok('no aparece la pregunta', !r.visible('card-sens'));

console.log('\nEn ingles:');
r = run({ recovery: null, hrv: null, rhr: null, sleep_score: null, asleep_h: null }, { lang: 'en' });
ok('la pregunta esta en ingles', /How do you feel/.test(r.q('sens-h')), r.q('sens-h'));

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
