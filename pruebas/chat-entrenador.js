// Prueba la burbuja del entrenador: que abra, que mande lo que escribes, que muestre la
// respuesta, y que un ajuste que venga del entrenador cambie el entrenamiento de verdad.
// El servidor va simulado (no se llama a la API de Claude ni se gasta saldo).
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});
// Cuenta conectada con 54% de recuperacion hoy: da rodada suave, que si tiene entrenamiento propio.
const w = []; for (let i = 45; i >= 0; i--) w.push({ date: iso(i), recovery: i === 0 ? 54 : 65, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: 8 });
data.whoop = w;
const acts = []; for (let i = 45; i >= 1; i--) if (i % 3) acts.push({ date: iso(i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
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
data.zones = [{ weight_kg: 85.5, ftp_w: 250, ftp_wkg: 2.92, hr_max: 196, device: 'intervals.icu',
  power_zones: [{ label: 'Z1 Recovery', min: 0, max: 137 }, { label: 'Z2 Endurance', min: 138, max: 187 }],
  heart_rate_zones: [{ label: 'Z1 Recovery', min: 0, max: 127 }, { label: 'Z2 Endurance', min: 128, max: 158 }] }];

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));

// Servidor simulado: guarda lo que le mandan y devuelve lo que la prueba le diga.
window.eval(`window.__view = ${JSON.stringify(view)};
  window.localStorage.setItem('rr_lang','es');
  window.__sent = []; window.__reply = { text: 'Listo.' };
  window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
    onData: (f) => { window.__cb = f; }, params: () => ({lang:'es'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
  window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
  window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ok:true}), signedIn: () => true,
    chat: async (p) => { window.__sent.push(p); if (window.__reply.__throw) throw new Error(window.__reply.__throw); return window.__reply; } };
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({data:{},error:null}) } }) };`);
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
window.eval(m[1]);
// account.js define window.rrAccount de verdad; aqui se vuelve a poner el simulado.
window.eval(`window.rrAccount = { syncNow: async () => ({}), sendWorkout: async () => ({ok:true}), signedIn: () => true,
  chat: async (p) => { window.__sent.push(p); if (window.__reply.__throw) throw new Error(window.__reply.__throw); return window.__reply; } };`);
window.eval(fs.readFileSync(path.join(ROOT, 'coach.js'), 'utf8'));
window.__cb && window.__cb();

const doc = window.document;
const q = (id) => { const e = doc.getElementById(id); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : '(no existe)'; };
const click = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const msgs = () => [...doc.querySelectorAll('#rc-log .rc-msg')].map((x) => x.className.replace('rc-msg ', '') + ': ' + x.textContent.trim());
const wait = () => new Promise((r) => setTimeout(r, 30));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n); } };

// coach.js espera a que la pagina termine de cargar, igual que en el navegador de verdad.
const ready = new Promise((r) => {
  if (window.document.readyState !== 'loading') return r();
  window.document.addEventListener('DOMContentLoaded', () => r());
  setTimeout(r, 1000);
});

(async () => {
  await ready; await new Promise((r) => setTimeout(r, 20));
  console.log('La burbuja:');
  ok('existe y esta siempre visible', !!doc.getElementById('rc-fab'));
  ok('el chat arranca cerrado', doc.getElementById('rc-sheet').hidden);
  click('rc-fab');
  ok('al tocarla se abre', !doc.getElementById('rc-sheet').hidden);
  ok('saluda al abrir', msgs().length === 1 && /coach:/.test(msgs()[0]));

  console.log('\nEscribir y responder:');
  window.eval(`window.__reply = { text: 'Con 54% hoy toca suave, 45 minutos tranquilos.' }`);
  doc.getElementById('rc-in').value = '¿qué hago hoy?';
  click('rc-go'); await wait();
  ok('lo que escribiste aparece en el chat', msgs().some((x) => x.startsWith('me:') && x.includes('¿qué hago hoy?')));
  ok('la respuesta aparece en el chat', msgs().some((x) => x.startsWith('coach:') && x.includes('45 minutos')));
  ok('el cuadro de texto queda vacio', doc.getElementById('rc-in').value === '');

  const sent = window.__sent[0];
  console.log('\nLo que se le manda al entrenador:');
  ok('va el mensaje del ciclista', sent.messages[sent.messages.length - 1].content.includes('¿qué hago hoy?'));
  ok('va la decision real del dia', sent.context.decision && sent.context.decision.nivel === 'suave');
  ok('va la recuperacion real', sent.context.whoop && sent.context.whoop.recuperacion === 54);
  ok('van las zonas reales', sent.context.zonas && sent.context.zonas.ftp_w === 250);
  ok('va el entrenamiento de hoy', !!sent.context.entrenamiento_de_hoy);
  ok('no va ninguna clave ni token', !JSON.stringify(sent).toLowerCase().match(/api[_-]?key|token|secret|bearer/));

  console.log('\nEl entrenador cambia el entrenamiento:');
  const before = q('wk-steps');
  window.eval(`window.__reply = { text: 'Listo, te lo dejo en 30 minutos.', action: { mins: 30 } }`);
  doc.getElementById('rc-in').value = 'solo tengo 30 minutos';
  click('rc-go'); await wait();
  ok('avisa que lo cambio', msgs().some((x) => x.startsWith('note:')));
  ok('el entrenamiento de verdad cambio', q('wk-steps') !== before);
  ok('ahora dura 30 min', /30 min/.test(q('wk-meta')));

  window.eval(`window.__reply = { text: 'Ok, hoy descansas.', action: { skip: true } }`);
  doc.getElementById('rc-in').value = 'hoy no puedo';
  click('rc-go'); await wait();
  ok('"hoy no puedo" deja el dia libre', /libre/i.test(q('wk-title')));

  window.eval(`window.__reply = { text: 'Volvemos al plan.', action: { reset: true } }`);
  doc.getElementById('rc-in').value = 'mejor volvamos al plan';
  click('rc-go'); await wait();
  ok('"volver al plan" deshace los ajustes', /suave/i.test(q('wk-title')));

  console.log('\nEl plan se manda solo al calendario:');
  window.eval(`window.__reply = { text: 'Listo, ahi quedo tu bloque.', reload: true, pushed: 12 }`);
  doc.getElementById('rc-in').value = 'armame el plan de 2 semanas';
  click('rc-go'); await wait();
  ok('avisa que ya van camino al Garmin', msgs().some((x) => x.startsWith('note:') && /Garmin/.test(x)));
  ok('dice cuantos entrenamientos', msgs().some((x) => x.startsWith('note:') && /12/.test(x)));
  window.eval(`window.__reply = { text: 'Meta guardada.', reload: true }`);
  doc.getElementById('rc-in').value = 'mi meta es el haute route';
  click('rc-go'); await wait();
  ok('si no hubo nada que mandar, no promete envios', msgs().filter((x) => x.startsWith('note:')).some((x) => /guard/i.test(x) && !/Garmin/.test(x)));

  console.log('\nCuando algo falla:');
  window.eval(`window.__reply = { __throw: 'Se acabo el saldo de la cuenta de Claude.' }`);
  doc.getElementById('rc-in').value = 'hola';
  click('rc-go'); await wait();
  ok('muestra el motivo real, no un error generico', msgs().some((x) => x.startsWith('bad:') && x.includes('saldo')));

  console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
  if (errors.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
