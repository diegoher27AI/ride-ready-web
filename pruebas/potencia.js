// "Mejor 5 min 4.09 W/kg, 307 W" era del ciclista de EJEMPLO y parecia suyo.
// Ahora la potencia sale de cada salida propia, con el peso con el que se midio.
// Esta prueba corre adapter.js de verdad contra una cuenta simulada.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// ACTS: lo que habria guardado en la tabla activities.
function run(ACTS) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('ERROR: ' + (e && e.message)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', virtualConsole: vc, url: 'https://example.test/' });
  const { window } = dom;
  window.fetch = async (url) => {
    const rel = String(url).replace(/^.*\/(data\/)/, '$1');
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return { ok: false, json: async () => { throw new Error('404'); } };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const well = []; for (let i = 60; i >= 0; i--) well.push({ date: iso(i), readiness: 65, hrv: 50, resting_hr: 55, sleep_min: 430 });
  window.__filas = { activities: ACTS, wellness: well };
  window.eval(`const F = window.__filas;
    function tabla(name) {
      const perfil = { weight_kg: 80, ftp_w: 250, hr_max: 196, power_zones: [], heart_rate_zones: [] };
      const o = { select: () => o, eq: () => o, gte: () => o, order: () => o, range: () => o,
        maybeSingle: async () => ({ data: name === 'athlete_profile' ? perfil : null, error: null }),
        then: (f, r) => Promise.resolve({ data: F[name] || [], error: null }).then(f, r) };
      return o;
    }
    window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), onAuthStateChange: () => {} },
      from: (n) => tabla(n), functions: { invoke: async () => ({ data: {}, error: null }) } }) };`);
  window.eval(fs.readFileSync(path.join(ROOT, 'adapter.js'), 'utf8'));
  return new Promise((res) => {
    const fin = () => {
      const get = (id) => (window.dash.data(id).data || []);
      res({ power: get('power'), monthly: get('monthly'), fitness_hist: get('fitness_hist'), errs });
    };
    window.dash.onData(fin); setTimeout(fin, 3000);
  });
}

const salida = (n, extra) => ({ date: iso(n), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30,
  relative_effort: 55, calories: 600, avg_hr: 140, max_hr: 170, avg_watts: 180, ...extra });

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

(async () => {
  console.log('Con potenciometro:');
  let r = await run([
    salida(10, { p5_w: 300, p20_w: 250, weight_kg: 80 }),
    salida(5, { p5_w: 320, p20_w: 260, weight_kg: 80 }),
    salida(1, { p5_w: 310, p20_w: 255, weight_kg: 80 }),
  ]);
  console.log('   salidas con potencia:', r.power.length);
  ok('arma una fila por salida', r.power.length === 3, r.power.length);
  const mejor = r.power.reduce((a, b) => (+b.p5_wkg > +a.p5_wkg ? b : a));
  ok('el mejor 5 min es 320 W', +mejor.p5_w === 320, mejor.p5_w);
  ok('lo pasa a W/kg con su peso (320/80 = 4.00)', +mejor.p5_wkg === 4, mejor.p5_wkg);
  ok('NO es el 307 W del ejemplo', !r.power.some((x) => +x.p5_w === 307));
  ok('NO es el 4.09 W/kg del ejemplo', !r.power.some((x) => +x.p5_wkg === 4.09));
  ok('calcula la eficiencia (180 W / 140 lpm)', +r.power[0].ef === 1.29, r.power[0].ef);
  ok('no inventa etiquetas del ejemplo', r.power.every((x) => ['hard', 'long', 'easy'].includes(x.ride_type)), r.power.map((x) => x.ride_type).join(','));

  console.log('\nEl peso de la salida manda sobre el del perfil:');
  r = await run([salida(3, { p5_w: 300, p20_w: 250, weight_kg: 75 }), salida(2, { p5_w: 300, p20_w: 250 })]);
  ok('con su peso propio: 300/75 = 4.00', +r.power[0].p5_wkg === 4, r.power[0].p5_wkg);
  ok('sin peso propio usa el del perfil: 300/80 = 3.75', +r.power[1].p5_wkg === 3.75, r.power[1].p5_wkg);

  console.log('\nComo clasifica cada salida:');
  r = await run([
    salida(4, { p5_w: 300, weight_kg: 80, moving_min: 200, relative_effort: 110 }),
    salida(3, { p5_w: 300, weight_kg: 80, moving_min: 60, relative_effort: 20 }),
    salida(2, { p5_w: 300, weight_kg: 80, moving_min: 60, relative_effort: 70 }),
  ]);
  ok('200 min es larga', r.power[0].ride_type === 'long', r.power[0].ride_type);
  ok('poco esfuerzo por minuto es suave', r.power[1].ride_type === 'easy', r.power[1].ride_type);
  ok('el resto es fuerte', r.power[2].ride_type === 'hard', r.power[2].ride_type);

  console.log('\nSIN potenciometro (la mayoria de los amigos):');
  r = await run([salida(3), salida(2), salida(1)]);
  ok('no inventa potencia', r.power.length === 0, r.power.length);
  ok('NO se queda con la del ejemplo', !r.power.some((x) => +x.p5_w === 307));

  console.log('\nCarga mensual e historial de forma:');
  r = await run([salida(40, { p5_w: 300, weight_kg: 80 }), salida(10, { p5_w: 300, weight_kg: 80 }), salida(2, { p5_w: 300, weight_kg: 80 })]);
  ok('la carga mensual sale de sus salidas', r.monthly.length >= 1 && r.monthly.length <= 3, r.monthly.length);
  const totales = r.monthly.reduce((a, m) => a + (+m.sessions || 0), 0);
  ok('cuenta las 3 salidas, ni una mas', totales === 3, totales);
  ok('no quedan los 226 del ejemplo', !r.monthly.some((m) => +m.sessions > 20));
  ok('el historial de forma sale del pmc propio', r.fitness_hist.length > 0 && r.fitness_hist.length < 100, r.fitness_hist.length);
  ok('no son las 562 muestras del ejemplo', r.fitness_hist.length !== 562, r.fitness_hist.length);

  console.log('\nErrores de la app:', r.errs.length ? r.errs : 'ninguno');
  if (r.errs.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
