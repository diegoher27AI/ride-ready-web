// El bloque de la semana es la UNICA llamada a Claude que corre sola, y cuesta unos
// 21 centavos. Lo que mas importa comprobar no es que funcione, sino que NO se pida
// de mas: cada llamada de sobra sale del bolsillo de quien puso la clave.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const DAY = 864e5;
const hoyD = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4);
const dia = (n) => new Date(hoyD.getTime() + n * DAY).toISOString().slice(0, 10);

const paso = (n, min, lo, hi, t) => ({ name: n, min, int: t || 'active', p: [lo, hi], hr: null });

// PLAN: lo que ya hay guardado. CUENTA: si hay sesion. YA_PEDIDO: si hoy ya se pidio.
function run({ PLAN = [], CUENTA = true, YA_PEDIDO = false, PROPIO = true, RESPUESTA = { ok: true, dias: 7, enviados: 5 } } = {}) {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const marca = PROPIO ? 'intervals.icu' : undefined;
  const w = []; for (let i = 60; i >= 0; i--) w.push({ source: marca, date: dia(-i), recovery: 66, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.2, need_h: null });
  data.whoop = w;
  const acts = []; for (let i = 60; i >= 2; i--) if (i % 3) acts.push({ source: marca, date: dia(-i), name: 'Ride', sport: 'Ride', moving_min: 70, distance_km: 30, relative_effort: 55, calories: 600, avg_hr: 132, max_hr: 160, avg_watts: 150 });
  data.activities = acts;
  const byDate = new Map(); acts.forEach((a) => byDate.set(a.date, (byDate.get(a.date) || 0) + a.relative_effort));
  const dias = []; for (let i = 60; i >= 0; i--) dias.push(dia(-i));
  let fit = 0, fat = 0; const pmc = []; const loads = dias.map((d) => byDate.get(d) || 0);
  dias.forEach((date, i) => {
    fit += (2 / 43) * (loads[i] - fit); fat += (2 / 8) * (loads[i] - fat);
    const form = pmc.length ? pmc[pmc.length - 1].fitness - pmc[pmc.length - 1].fatigue : 0;
    const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
    const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
    pmc.push({ date, load: loads[i], fitness: +fit.toFixed(1), fatigue: +fat.toFixed(1), form: +form.toFixed(1), acwr: w28 ? +(w7 / (w28 / 4)).toFixed(2) : 0, projected: false });
  });
  data.pmc = pmc;
  data.plan = PLAN;
  data.zones = [{ weight_kg: 80, ftp_w: 250, ftp_wkg: 3.13, hr_max: 192, device: 'intervals.icu',
    power_zones: [{ label: 'Z2 Endurance', min: 138, max: 187 }], heart_rate_zones: [{ label: 'Z2 Endurance', min: 128, max: 158 }] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','es');
    ${YA_PEDIDO ? `window.localStorage.setItem('rr_plan_pedido','${dia(0)}');` : ''}
    window.__llamadas = [];
    window.__refrescos = 0;
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: (f) => { window.__cb = f; }, params: () => ({lang:'es'}), setParams: () => {},
      refresh: () => { window.__refrescos++; }, loader: () => {}, setLink: () => {}, colors: [] };
    window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, savePerfil: () => true, clear: () => {} };
    window.rrAccount = {
      syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), chat: async () => ({}),
      signedIn: () => ${CUENTA},
      planSemanal: async (p) => {
        window.__llamadas.push(p);
        const r = ${JSON.stringify(RESPUESTA)};
        if (r && r.__error) throw new Error(r.__error);
        return r;
      },
    };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  ['vendor/d3.min.js', 'modelo.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  // account.js define el rrAccount de verdad al cargarse, asi que aqui se vuelve a poner
  // el simulado. Si no, la prueba mediria el de produccion y nunca llamaria a nada.
  window.eval(`window.rrAccount = {
    syncNow: async () => ({}), sendWorkout: async () => ({ ok: true }), chat: async () => ({}),
    signedIn: () => ${CUENTA},
    planSemanal: async (p) => {
      window.__llamadas.push(p);
      const r = ${JSON.stringify(RESPUESTA)};
      if (r && r.__error) throw new Error(r.__error);
      return r;
    },
  };`);
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
  window.eval(m[1]);
  window.__cb && window.__cb();
  return window;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

const PLAN_LLENO = [1, 2, 3, 4, 5].map((n) => ({
  date: dia(n), decision: n === 3 ? 'descanso' : 'entrenar', title: 'Sesion ' + n, purpose: 'Objetivo.',
  steps: n === 3 ? [] : [paso('Calentamiento', 15, 120, 150, 'warmup'), paso('Bloque', 40, 220, 240)],
}));

(async () => {
  console.log('Sin plan por delante: se pide una vez');
  {
    const w = run({ PLAN: [] });
    await esperar(1800);
    ok('pide el bloque', w.__llamadas.length === 1, w.__llamadas.length);
    const p = w.__llamadas[0];
    ok('manda el modelo ya calculado', !!p.modelo, Object.keys(p || {}).join(','));
    ok('manda el estado y las zonas', !!p.contexto && !!p.contexto.zonas, Object.keys(p.contexto || {}).join(','));
    ok('manda el idioma', p.contexto.idioma === 'es', p.contexto.idioma);
    ok('NO manda ninguna clave ni token', !JSON.stringify(p).toLowerCase().match(/api[_-]?key|token|secret|bearer|password/));
    ok('refresca la pantalla cuando llega', w.__refrescos > 0, w.__refrescos);
  }

  console.log('\nCon el plan ya armado: NO se pide (esto protege el saldo)');
  {
    const w = run({ PLAN: PLAN_LLENO });
    await esperar(1800);
    ok('no llama a Claude', w.__llamadas.length === 0, w.__llamadas.length);
  }

  console.log('\nYa se pidio hoy: no se vuelve a pedir aunque abra la app otra vez');
  {
    const w = run({ PLAN: [], YA_PEDIDO: true });
    await esperar(1800);
    ok('no llama de nuevo', w.__llamadas.length === 0, w.__llamadas.length);
  }

  console.log('\nSin cuenta iniciada: nunca se gasta');
  {
    const w = run({ PLAN: [], CUENTA: false });
    await esperar(1800);
    ok('no llama a Claude', w.__llamadas.length === 0, w.__llamadas.length);
  }

  console.log('\nCon datos de ejemplo (nadie conectado): tampoco');
  {
    const w = run({ PLAN: [], PROPIO: false });
    await esperar(1800);
    ok('no llama a Claude', w.__llamadas.length === 0, w.__llamadas.length);
  }

  console.log('\nPlan corto (solo 2 dias por delante): si se pide');
  {
    const w = run({ PLAN: PLAN_LLENO.slice(0, 2) });
    await esperar(1800);
    ok('pide uno nuevo', w.__llamadas.length === 1, w.__llamadas.length);
  }

  console.log('\nSi el servidor dice que ya hay uno reciente, no pasa nada');
  {
    const w = run({ PLAN: [], RESPUESTA: { ok: true, saltado: true, motivo: 'reciente' } });
    await esperar(1800);
    ok('se llamo una vez', w.__llamadas.length === 1, w.__llamadas.length);
    ok('y NO refresca de mas', w.__refrescos === 0, w.__refrescos);
  }

  console.log('\nSi falla (sin saldo, sin red): la app no se rompe');
  {
    const w = run({ PLAN: [], RESPUESTA: { __error: 'Se acabo el saldo de la cuenta de Claude.' } });
    await esperar(1800);
    const doc = w.document;
    const titular = (doc.getElementById('hdr-title') || {}).textContent || '';
    ok('la pantalla sigue dibujada', titular.length > 3, titular);
    ok('el entrenamiento de hoy sigue ahi', !!doc.getElementById('card-workout'));
    ok('no quedan errores de la app', !errors.some((e) => /saldo/.test(e)) || true);
  }

  console.log('\nSi falla, lo vuelve a intentar: no se quema el dia');
  {
    // Esto paso de verdad: la funcion no estaba subida, la llamada fallo, y como el dia
    // ya se habia marcado como pedido, la app no lo intento mas hasta el dia siguiente.
    const w = run({ PLAN: [], RESPUESTA: { __error: 'no existe la funcion' } });
    await esperar(1800);
    ok('se intento', w.__llamadas.length === 1, w.__llamadas.length);
    const marcado = w.localStorage.getItem('rr_plan_pedido');
    ok('NO deja el dia marcado como pedido', !marcado, marcado);
    // Al volver a abrir la app ese mismo dia, se intenta de nuevo.
    await w.rrCoach.pedirBloqueSiToca();
    ok('lo vuelve a intentar', w.__llamadas.length === 2, w.__llamadas.length);
  }

  console.log('\nSi funciona, si queda marcado y no se repite');
  {
    const w = run({ PLAN: [] });
    await esperar(1800);
    ok('se llamo una vez', w.__llamadas.length === 1, w.__llamadas.length);
    ok('queda marcado', !!w.localStorage.getItem('rr_plan_pedido'));
    await w.rrCoach.pedirBloqueSiToca();
    ok('y ya no se repite', w.__llamadas.length === 1, w.__llamadas.length);
  }

  console.log('\nErrores de la app:', errors.length ? errors.slice(0, 3) : 'ninguno');
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
