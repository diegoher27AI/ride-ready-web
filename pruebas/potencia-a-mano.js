// Sin potenciometro el modelo se queda sin con que ajustarse. En vez de pedir los vatios
// de cientos de entrenamientos, el modelo elige las pocas salidas donde un esfuerzo de
// 20 min cabe y pudo ser fuerte, y solo pregunta por esas. Mas el peso y el pulso maximo.
// Aqui se comprueba el camino completo: elegir, escribir, guardar, y que el modelo lo use.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const DAY = 864e5;
const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4);
const atras = (n) => new Date(hoy.getTime() - n * DAY).toISOString().slice(0, 10);

// Un ano de salidas, sin un solo vatio: el caso de la mayoria de los amigos.
const ACTS = [];
for (let i = 330; i >= 1; i--) {
  if (i % 3 === 0) continue;
  const duro = i % 7 === 1;
  const largo = i % 7 === 5;
  ACTS.push({ source: 'intervals.icu', date: atras(i), name: duro ? 'Series' : largo ? 'Fondo' : 'Rodada',
    sport: 'Ride', moving_min: largo ? 190 : duro ? 70 : 55,
    distance_km: 40, relative_effort: largo ? 140 : duro ? 95 : 45,
    calories: 700, avg_hr: duro ? 152 : 128, max_hr: duro ? 178 : 150, avg_watts: null });
}
ACTS.push({ source: 'intervals.icu', date: atras(4), name: 'Caminata', sport: 'Walk', moving_min: 50, relative_effort: 8 });
ACTS.push({ source: 'intervals.icu', date: atras(6), name: 'Corta', sport: 'Ride', moving_min: 18, relative_effort: 40 });

function arrancar() {
  const data = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
    data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
  });
  const w = []; for (let i = 45; i >= 0; i--) w.push({ source: 'intervals.icu', date: atras(i), recovery: 66, hrv: 50, hrv_30d: 50, hrv_7d: 50, rhr: 55, rhr_30d: 55, rhr_7d: 55, asleep_h: 7.1, need_h: null });
  data.whoop = w;
  data.activities = ACTS;
  data.power = [];
  data.zones = [{ weight_kg: null, ftp_w: null, hr_max: null, device: 'intervals.icu', power_zones: [], heart_rate_zones: [] }];

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
  const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
  window.eval(`window.__view = ${JSON.stringify(view)};
    window.localStorage.setItem('rr_lang','es');
    window.__guardado = {};
    window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
      onData: () => {}, params: () => ({lang:'es'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    // rrLocal simulado, para ver exactamente que se guarda.
    window.rrLocal = {
      get: () => window.__guardado,
      saveWhoop: () => true, saveActivity: () => true, clear: () => { window.__guardado = {}; },
      savePerfil: (perfil, potencias) => {
        window.__guardado.perfil = Object.assign({}, window.__guardado.perfil, perfil);
        window.__guardado.potencias = Object.assign({}, window.__guardado.potencias, potencias);
        return true;
      },
    };
    window.rrAccount = { signedIn: () => true, syncNow: async () => ({}) };
    window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }) }),
      functions: { invoke: async () => ({data:{},error:null}) } }) };`);
  window.eval(fs.readFileSync(path.join(ROOT, 'modelo.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'importer.js'), 'utf8'));
  // En jsdom la pagina queda en 'loading', asi que el cargador se queda esperando.
  // Se dispara el aviso de pagina lista, igual que haria el navegador.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

const w = arrancar();
const doc = w.document;
const M = w.rrModelo;

console.log('El modelo elige que dias preguntar:');
{
  const c = M.candidatos20min(ACTS, 6);
  console.log('   ', c.map((x) => `${x.date} ${x.name} ${x.moving_min}min`).join(' | '));
  ok('elige 6 salidas, no cientos', c.length === 6, c.length);
  ok('todas duran al menos 25 min', c.every((x) => x.moving_min >= 25), c.map((x) => x.moving_min).join(','));
  ok('descarta la caminata', !c.some((x) => x.sport === 'Walk'));
  ok('descarta la salida de 18 min', !c.some((x) => x.moving_min === 18));
  ok('elige las fuertes, no los paseos', c.every((x) => x.relative_effort >= 90), c.map((x) => x.relative_effort).join(','));
  ok('reparte en meses distintos', new Set(c.map((x) => x.date.slice(0, 7))).size >= 5, new Set(c.map((x) => x.date.slice(0, 7))).size);
  ok('las ordena de lo mas nuevo a lo mas viejo', c[0].date > c[c.length - 1].date);
}

console.log('\nQue le falta al modelo:');
{
  const f = M.queFalta(ACTS, null);
  ok('sabe que no hay ninguna potencia', f.tiene === 0, f.tiene);
  ok('dice cuantas faltan', f.potencias === 8, f.potencias);
  ok('pide el peso', f.peso === true);
  ok('pide el pulso maximo', f.hr_max === true);
}

console.log('\nLa pantalla de Cargar datos:');
{
  doc.getElementById('btn-load').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const campos = [...doc.querySelectorAll('.rr-pw-in')];
  ok('se abre y pinta una casilla por salida', campos.length === 6, campos.length);
  ok('pide el peso', !!doc.getElementById('rr-peso'));
  ok('pide el pulso maximo', !!doc.getElementById('rr-hrmax'));
  ok('pide el FTP si lo sabe', !!doc.getElementById('rr-ftp'));
  const texto = doc.getElementById('rr-pw-dias').textContent;
  ok('dice cuantas mediciones faltan', /8/.test(texto), texto.slice(0, 110));
  ok('cada casilla sabe de que dia es', campos.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.dataset.fecha)));
  ok('cada fila muestra la fecha y la duracion', /min/.test(doc.getElementById('rr-pw-lista').textContent));
}

console.log('\nEscribir y guardar:');
{
  const campos = [...doc.querySelectorAll('.rr-pw-in')];
  campos.forEach((i, n) => { i.value = String(250 + n * 5); });
  doc.getElementById('rr-peso').value = '78';
  doc.getElementById('rr-hrmax').value = '191';
  doc.getElementById('rr-ftp').value = '265';
  doc.getElementById('rr-pw-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const g = w.__guardado;
  ok('guarda las 6 potencias', Object.keys(g.potencias || {}).length === 6, Object.keys(g.potencias || {}).length);
  ok('guarda el peso', g.perfil.weight_kg === 78, g.perfil.weight_kg);
  ok('guarda el pulso maximo', g.perfil.hr_max === 191, g.perfil.hr_max);
  ok('guarda el FTP', g.perfil.ftp_w === 265, g.perfil.ftp_w);
  ok('las guarda por fecha', Object.keys(g.potencias).every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)));
  ok('avisa que guardo', /Guardado/.test(doc.getElementById('rr-pw-st').textContent));
}

console.log('\nValores imposibles no entran:');
{
  w.__guardado = {};
  doc.getElementById('btn-load').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const campos = [...doc.querySelectorAll('.rr-pw-in')];
  campos[0].value = '2000';          // nadie hace 2000 W por 20 min
  campos[1].value = '10';            // ni 10 W
  campos[2].value = 'hola';
  campos[3].value = '280';           // este si
  doc.getElementById('rr-peso').value = '500';
  doc.getElementById('rr-hrmax').value = '400';
  doc.getElementById('rr-pw-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const g = w.__guardado;
  ok('solo guarda la potencia creible', Object.keys(g.potencias).length === 1, JSON.stringify(g.potencias));
  ok('no guarda un peso de 500 kg', g.perfil.weight_kg === undefined, g.perfil.weight_kg);
  ok('no guarda un pulso de 400', g.perfil.hr_max === undefined, g.perfil.hr_max);
}

console.log('\nCon las potencias escritas, el modelo ya ajusta:');
{
  // Potencias que siguen el modelo de verdad, para ver si las usa.
  const serie = M.cargaDiaria(ACTS);
  const F = M.ema(serie.cargas, 35), A = M.ema(serie.cargas, 6);
  const idx = new Map(serie.fechas.map((d, i) => [d, i]));
  const conMano = ACTS.map((a) => {
    const i = idx.get(a.date);
    if (i == null || a.moving_min < 25 || a.relative_effort < 90) return a;
    return { ...a, p20_w: Math.round(190 + 0.85 * F[i] - 1.5 * A[i]), a_mano: true };
  });
  const antes = M.ajustarForma(ACTS);
  const despues = M.ajustarForma(conMano);
  ok('sin potencias usa los 42 y 7 de libro', antes.tau_forma === 42 && antes.propio === false, antes.motivo);
  ok('con potencias ya ajusta a este ciclista', despues.propio === true, `propio=${despues.propio} motivo=${despues.motivo}`);
  ok('y encuentra constantes distintas a las de libro', despues.tau_forma !== 42, despues.tau_forma);
  console.log(`   de ${antes.tau_forma}/${antes.tau_fatiga} (libro) a ${despues.tau_forma}/${despues.tau_fatiga} (suyo), r2 ${despues.r2}`);
  const f2 = M.queFalta(conMano, { weight_kg: 78, hr_max: 191 });
  ok('ya no pide mas potencias', f2.potencias === 0, f2.potencias);
  ok('ni el peso ni el pulso maximo', f2.peso === false && f2.hr_max === false);
}

console.log('\nNo vuelve a preguntar por lo que ya tiene:');
{
  const conUna = ACTS.map((a) => (a.date === M.candidatos20min(ACTS, 6)[0].date ? { ...a, p20_w: 270 } : a));
  const c2 = M.candidatos20min(conUna, 6);
  ok('la salida ya respondida no vuelve a salir', !c2.some((x) => x.p20_w), c2.length);
  ok('propone otra en su lugar', c2.length === 6, c2.length);
}

console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
if (errors.length) fail++;
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
