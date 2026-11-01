// El modelo propone, el ciclista decide. El sabe cosas que la app no: una reunion,
// un dolor, o simplemente ganas. Aqui se comprueba que al elegir a mano cambie todo
// de verdad (titular, entrenamiento, gato) y que se pueda volver a lo que dice la app.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

function run(REC, lang = 'es') {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: iso(i), recovery: i === 0 ? REC : 66, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: null });
  data.whoop = w;
  const acts = []; for (let i = 45; i >= 2; i--) if (i % 3) acts.push({ source: 'intervals.icu', date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
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
    power_zones: [{ label: 'Z1 Recovery', min: 0, max: 137 }, { label: 'Z2 Endurance', min: 138, max: 187 }],
    heart_rate_zones: [{ label: 'Z1 Recovery', min: 0, max: 127 }, { label: 'Z2 Endurance', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','${lang}');
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'${lang}'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, savePerfil: () => true, clear: () => {} };
    window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), signedIn: () => true, planSemanal: async () => ({ ok: true, saltado: true }) };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'modelo.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  const doc = window.document;
  const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
  const botones = () => [...doc.querySelectorAll('#ask-me button')].map((b) => b.textContent.trim());
  const tocar = (etiqueta) => {
    const b = [...doc.querySelectorAll('#ask-me button')].find((x) => x.textContent.trim() === etiqueta);
    if (!b) return false;
    b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return true;
  };
  const marcado = (etiqueta) => {
    const b = [...doc.querySelectorAll('#ask-me button')].find((x) => x.textContent.trim() === etiqueta);
    return !!b && b.getAttribute('aria-pressed') === 'true';
  };
  return { q, botones, tocar, marcado, doc };
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

console.log('Recuperacion 72 (verde): la app dice entrenar');
let r = run(72);
console.log('   botones:', r.botones().join(' | '));
ok('aparece el selector de decision', r.botones().includes('Entrenar') && r.botones().includes('Descansar'), r.botones().join('|'));
ok('arranca en "lo que dice la app"', r.marcado('Lo que dice la app'));
ok('el titular dice entrenar', /puedes entrenar/i.test(r.q('hdr-title')), r.q('hdr-title'));

console.log('\nElijo descansar aunque la app diga entrenar:');
r.tocar('Descansar');
ok('el titular cambia a descansar', /descansar/i.test(r.q('hdr-title')), r.q('hdr-title'));
ok('el boton queda marcado', r.marcado('Descansar'));
ok('la tarjeta del entrenamiento lo refleja', /descanso|libre/i.test(r.q('wk-title')), r.q('wk-title'));
ok('el gato no sigue diciendo que entrenes', !/a tope|buen día para/i.test(r.q('pet-say')), r.q('pet-say').slice(0, 70));
ok('no avisa de riesgo, porque pediste MENOS', !/Estás pidiendo más/.test(r.q('ask-me')));

console.log('\nVuelvo a lo que dice la app:');
r.tocar('Lo que dice la app');
ok('el titular vuelve a entrenar', /puedes entrenar/i.test(r.q('hdr-title')), r.q('hdr-title'));
ok('y el boton vuelve a su sitio', r.marcado('Lo que dice la app'));

console.log('\nRecuperacion 25 (roja): la app dice descansar');
r = run(25);
ok('el titular dice descansar', /descansar/i.test(r.q('hdr-title')), r.q('hdr-title'));

console.log('\nElijo entrenar igual: tiene que avisarme');
r.tocar('Entrenar');
ok('el titular cambia a entrenar', /entrenar|zona 2/i.test(r.q('hdr-title')), r.q('hdr-title'));
ok('AVISA que pides mas de lo que dicen tus numeros', /Estás pidiendo más/.test(r.q('ask-me')), r.q('ask-me').slice(-120));

console.log('\nElijo ir suave con recuperacion roja:');
r = run(25);
r.tocar('Ir suave');
ok('el titular dice ir suave', /suave/i.test(r.q('hdr-title')), r.q('hdr-title'));
ok('da un entrenamiento suave con pasos', r.q('wk-steps').length > 10, r.q('wk-steps').slice(0, 60));
ok('tambien avisa, porque pediste mas', /Estás pidiendo más/.test(r.q('ask-me')));

console.log('\n"Hoy no puedo" sigue funcionando y no choca con el selector:');
r = run(72);
r.tocar('Hoy no puedo');
ok('el dia queda libre', /libre|descans/i.test(r.q('wk-title')), r.q('wk-title'));
r.tocar('Entrenar');
ok('elegir entrenar deshace el "hoy no puedo"', !/libre/i.test(r.q('wk-title')), r.q('wk-title'));

console.log('\nEn ingles:');
r = run(72, 'en');
ok('el selector esta en ingles', r.botones().includes('Train') && r.botones().includes('Rest'), r.botones().join('|'));
r.tocar('Rest');
ok('y funciona igual', /rest/i.test(r.q('hdr-title')), r.q('hdr-title'));

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
