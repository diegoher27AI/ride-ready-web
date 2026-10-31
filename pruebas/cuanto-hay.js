// Comprueba el resumen de la pantalla Cuenta: cuantas actividades y cuantos dias de
// bienestar hay guardados de verdad, y desde cuando. Es lo que contesta de un vistazo
// "¿se cargo todo mi historico de Garmin?" sin abrir intervals.icu.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

// CASO: 'con_datos' | 'vacio' | 'tabla_rota'
function run(CASO, lang) {
  // El boton de Cuenta se cuelga al lado del de Actualizar, igual que en la app.
  const dom = new JSDOM('<!doctype html><html><body><div id="dash-root"><div class="jx">'
    + '<div class="bar"><button type="button" id="btn-refresh">Actualizar</button></div></div></div></body></html>',
    { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  window.localStorage.setItem('rr_lang', lang);
  window.eval(`window.__caso = ${JSON.stringify(CASO)};
    window.dash = { data: () => ({status:'missing',data:[]}), onData: () => {}, params: () => ({lang:'${lang}'}),
      setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    const CASO = window.__caso;
    // Simula el cliente de Supabase con una sesion iniciada.
    function q(tab) {
      let col = 'date', head = false, asc = true;
      const roto = CASO === 'tabla_rota';
      const total = CASO === 'vacio' ? 0 : (tab === 'activities' ? 1842 : 1120);
      const prim = tab === 'activities' ? '2019-04-02' : '2023-07-11';
      const ult  = tab === 'activities' ? '2026-10-30' : '2026-10-28';
      const o = {
        select: (c, opt) => { col = c; head = !!(opt && opt.head); return o; },
        eq: () => o, limit: () => o, maybeSingle: async () => ({ data: null, error: null }),
        order: (c, opt) => { col = c; asc = !!(opt && opt.ascending); return o; },
        then: (f, r) => {
          if (roto) return Promise.reject(new Error('relation does not exist')).then(f, r);
          if (head) return Promise.resolve({ count: total, data: null, error: null }).then(f, r);
          const rows = total ? [{ date: asc ? prim : ult }] : [];
          return Promise.resolve({ data: rows, count: total, error: null }).then(f, r);
        },
      };
      return o;
    }
    window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'diegoher27@gmail.com' } } } }),
              onAuthStateChange: (f) => { window.__auth = f; }, signOut: async () => ({}) },
      from: (tab) => q(tab),
      functions: { invoke: async () => ({ data: { activities: 3, wellness: 1 }, error: null }) } }) };`);
  window.eval(fs.readFileSync(path.join(ROOT, 'account.js'), 'utf8'));
  return window;
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra ? '-> ' + extra : ''); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('Con historico cargado:');
  let w = run('con_datos', 'es');
  await wait(60);
  w.document.getElementById('btn-account').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  let txt = (w.document.getElementById('ra-have') || {}).textContent || '';
  console.log('   texto:', txt);
  ok('dice cuantas actividades hay', /1842/.test(txt), txt);
  ok('dice desde cuando', /2019-04-02/.test(txt), txt);
  ok('dice hasta cuando', /2026-10-30/.test(txt), txt);
  ok('dice cuantos dias de bienestar', /1120/.test(txt), txt);
  ok('dice de cuando es el ultimo bienestar', /2026-10-28/.test(txt), txt);
  ok('no filtra la clave de intervals.icu', !/api|key|token/i.test(txt), txt);

  console.log('\nEn ingles:');
  w = run('con_datos', 'en');
  await wait(60);
  w.document.getElementById('btn-account').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  txt = (w.document.getElementById('ra-have') || {}).textContent || '';
  console.log('   texto:', txt);
  ok('esta en ingles', /Stored in your account/.test(txt), txt);

  console.log('\nCuenta nueva, sin nada guardado:');
  w = run('vacio', 'es');
  await wait(60);
  w.document.getElementById('btn-account').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  txt = (w.document.getElementById('ra-have') || {}).textContent || '';
  console.log('   texto:', txt);
  ok('dice que todavia no hay nada', /Todavia no hay nada/.test(txt), txt);
  ok('dice que toque Traer mis datos', /Traer mis datos/.test(txt), txt);

  console.log('\nSi la consulta falla, la pantalla no se rompe:');
  w = run('tabla_rota', 'es');
  await wait(60);
  w.document.getElementById('btn-account').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  txt = (w.document.getElementById('ra-have') || {}).textContent || '';
  ok('se queda callada, sin error en pantalla', txt === '', txt);
  ok('la pantalla de Cuenta sigue abierta', !w.document.getElementById('ra-sheet').hidden);
  ok('sigue diciendo con que correo entraste', /diegoher27@gmail.com/.test(w.document.getElementById('ra-signed').textContent));

  console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
  if (errors.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
