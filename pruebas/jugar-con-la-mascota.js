// Prueba que tocar al gato y darle cosas de verdad reaccione distinto cada vez.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = '/Users/juanhernandez/Library/CloudStorage/OneDrive-Personal/App/RIDE READY APP/ride-ready-web/public';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});
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
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({data:{},error:null}) } }) };`);
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
window.eval(m[1]);
window.__cb && window.__cb();

const doc = window.document;
const art = doc.getElementById('pet-art');
const say = () => (doc.getElementById('pet-say').textContent || '').trim();

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n); } };

// Tocarlo varias veces: deben salir frases distintas, no siempre la misma.
const seen = new Set();
for (let i = 0; i < 14; i++) {
     // el mensaje dura 2.4s; aqui se adelanta
  art.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  seen.add(say());
}
console.log('Tocar al gato:');
ok(`sale mas de una reaccion (salieron ${seen.size})`, seen.size >= 3);
ok('no se queda pegado en el texto normal', ![...seen].every((t) => t.startsWith('Listo para')));

// Debe aparecer algo volando y una animacion en el cuerpo.
const pops = doc.querySelectorAll('#pet-art .pet-pop');
ok('aparecen cosas volando al tocarlo', pops.length > 0);

console.log('\nDarle de comer:');
const before = say();
const btnFeed = [...doc.querySelectorAll('.pet-act')].find((b) => /pescado|Treat/i.test(b.textContent));
ok('existe el boton de darle de comer', !!btnFeed);
if (btnFeed) {
  
  btnFeed.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const first = say();
  ok('comer dice algo distinto a lo normal', first !== before);
  ok('comer no repite lo de tocarlo', !seen.has(first));
  
  btnFeed.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const second = say();
  ok('la segunda vez responde distinto', second !== first);
  
  btnFeed.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('a la tercera dice que ya esta lleno', /lleno/i.test(say()));
}

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
