// Supabase devuelve como mucho 1000 filas por pedido, y manda las PRIMERAS.
// Con mas de 1000 dias de bienestar, los ultimos meses no llegaban nunca: a Juan Diego
// se le congelo todo el 22 de julio, justo la fila 1000 contando desde el 27 oct 2023.
// Las actividades se salvaron de casualidad, por ser menos de 1000.
// Esta prueba corre adapter.js DE VERDAD contra un Supabase simulado que respeta ese tope.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');
const CAP = 1000;

const iso = (d) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const diaAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// DIAS_W = cuantos dias de bienestar hay guardados. N_ACT = cuantas actividades.
function run({ DIAS_W, N_ACT }) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('ERROR: ' + (e && e.message)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', virtualConsole: vc, url: 'https://example.test/' });
  const { window } = dom;

  // Los datos de ejemplo se sirven igual que en la app.
  window.fetch = async (url) => {
    const rel = String(url).replace(/^.*\/(data\/)/, '$1');
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return { ok: false, json: async () => { throw new Error('404'); } };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  const well = []; for (let i = DIAS_W - 1; i >= 0; i--) well.push({ date: diaAtras(i), readiness: 60 + (i % 20), hrv: 50, resting_hr: 55, sleep_min: 430 });
  const acts = []; for (let i = N_ACT - 1; i >= 0; i--) acts.push({ date: diaAtras(i * 2), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });

  let pedidos = 0;
  window.__filas = { wellness: well, activities: acts };
  window.__espia = () => pedidos;
  window.eval(`
    const FILAS = window.__filas, CAP = ${CAP};
    let pedidos = 0;
    window.__pedidos = () => pedidos;
    function tabla(name) {
      let desde = 0, hasta = CAP - 1;
      const perfil = { weight_kg: 85.5, ftp_w: 250, hr_max: 196, power_zones: [], heart_rate_zones: [] };
      const o = {
        select: () => o, eq: () => o, gte: () => o, order: () => o,
        range: (a, b) => { desde = a; hasta = b; return o; },
        maybeSingle: async () => ({ data: name === 'athlete_profile' ? perfil : null, error: null }),
        then: (f, r) => {
          const todas = FILAS[name] || [];
          // El tope de Supabase: nunca mas de CAP filas, y siempre desde el principio
          // de la ventana pedida. Si nadie pide ventana, es la primera.
          const fin = Math.min(hasta, desde + CAP - 1);
          const page = todas.slice(desde, fin + 1);
          if (name === 'wellness' || name === 'activities') pedidos++;
          return Promise.resolve({ data: page, error: null }).then(f, r);
        },
      };
      return o;
    }
    window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), onAuthStateChange: () => {} },
      from: (n) => tabla(n),
      functions: { invoke: async () => ({ data: {}, error: null }) } }) };`);

  window.eval(fs.readFileSync(path.join(ROOT, 'adapter.js'), 'utf8'));

  return new Promise((resolve) => {
    const fin = () => {
      const get = (id) => (window.dash.data(id).data || []);
      const w = get('whoop'), a = get('activities');
      resolve({
        w, a, errs,
        ultimoBienestar: w.length ? w[w.length - 1].date : null,
        ultimaActividad: a.length ? a[a.length - 1].date : null,
        pedidos: window.__pedidos(),
      });
    };
    window.dash.onData(fin); setTimeout(fin, 4000);
  });
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

(async () => {
  console.log('Su caso: 1100 dias de bienestar, 900 actividades');
  let r = await run({ DIAS_W: 1100, N_ACT: 900 });
  console.log('   bienestar que llego:', r.w.length, 'dias, hasta', r.ultimoBienestar);
  console.log('   pedidos a la base  :', r.pedidos);
  ok('llegan los 1100 dias, no 1000', r.w.length === 1100, r.w.length);
  ok('el ultimo dia es HOY', r.ultimoBienestar === diaAtras(0), r.ultimoBienestar);
  ok('NO se queda en la fila 1000', r.w.length !== 1000, r.w.length);
  ok('las actividades tambien llegan todas', r.a.length === 900, r.a.length);
  ok('hizo mas de un pedido por tabla', r.pedidos >= 3, r.pedidos);
  ok('la recuperacion de hoy tiene valor', isFinite(r.w[r.w.length - 1].recovery), r.w[r.w.length - 1].recovery);
  ok('viene marcado como suyo, no de ejemplo', r.w[r.w.length - 1].source === 'intervals.icu', r.w[r.w.length - 1].source);

  console.log('\nJusto en el borde: 1000 dias clavados');
  r = await run({ DIAS_W: 1000, N_ACT: 500 });
  ok('llegan los 1000, sin perder el ultimo', r.w.length === 1000, r.w.length);
  ok('el ultimo dia es HOY', r.ultimoBienestar === diaAtras(0), r.ultimoBienestar);

  console.log('\nUna fila sobre el borde: 1001');
  r = await run({ DIAS_W: 1001, N_ACT: 10 });
  ok('no se pierde la fila 1001', r.w.length === 1001, r.w.length);
  ok('el ultimo dia es HOY', r.ultimoBienestar === diaAtras(0), r.ultimoBienestar);

  console.log('\nTres anos largos: 2500 dias');
  r = await run({ DIAS_W: 2500, N_ACT: 2100 });
  ok('llegan los 2500 dias', r.w.length === 2500, r.w.length);
  ok('llegan las 2100 actividades', r.a.length === 2100, r.a.length);
  ok('el ultimo dia es HOY', r.ultimoBienestar === diaAtras(0), r.ultimoBienestar);

  console.log('\nCuenta chica, como la de un amigo nuevo: 30 dias');
  r = await run({ DIAS_W: 30, N_ACT: 12 });
  ok('llegan los 30 dias', r.w.length === 30, r.w.length);
  ok('no hace pedidos de mas', r.pedidos === 2, r.pedidos);

  const errs = [].concat(r.errs);
  console.log('\nErrores de la app:', errs.length ? errs : 'ninguno');
  if (errs.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
