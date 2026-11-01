// Los avisos de cada manana. Lo que mas importa comprobar no es que lleguen, sino que
// NO lleguen de mas: un aviso repetido, o uno a las 3 de la manana, es peor que ninguno.
// Las reglas de decision se sacan del archivo de verdad, no se copian.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'enviar-avisos', 'index.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };

// Se extraen las funciones del archivo real, quitando solo las anotaciones de tipo.
function sacar(nombre) {
  const m = SRC.match(new RegExp(`(async )?function ${nombre}\\(`));
  if (!m) throw new Error('no esta ' + nombre);
  let d = 0;
  for (let k = SRC.indexOf('{', m.index); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(m.index, k + 1); }
  }
  throw new Error('no cierra ' + nombre);
}
const sinTipos = (s) => s
  // Declaraciones con tipo: const p: Record<string, string> = {}
  .replace(/(const|let)\s+(\w+):\s*[^=;]+=/g, '$1 $2 =')
  // Parametros y retornos con tipo
  .replace(/(\w+):\s*Record<[^>]*>\s*\|\s*null(?=[,)])/g, '$1')
  .replace(/(\w+):\s*Record<[^>]*>(?=[,)])/g, '$1')
  .replace(/(\w+):\s*(number|string|boolean)\s*\|\s*null(?=[,)])/g, '$1')
  .replace(/(\w+):\s*(number|string|boolean)(?=[,)])/g, '$1')
  // Aserciones
  .replace(/\s+as\s+Record<[^>]*>\[\]/g, '')
  .replace(/\s+as\s+Record<[^>]*>/g, '')
  .replace(/\s+as\s+string\b/g, '');
const codigo = ['alla', 'decidir', 'textoDelDia'].map((n) => sinTipos(sacar(n))).join('\n');
const API = new Function(`${codigo}\nreturn { alla, decidir, textoDelDia };`)();

const num = (re) => Number((SRC.match(re) || [])[1]);
const DESDE_HORA = num(/DESDE_HORA = (\d+)/);
const RENDIRSE_HORA = num(/RENDIRSE_HORA = (\d+)/);

console.log('Las reglas de decision son las mismas que las de la app:');
ok('80% es verde', API.decidir(80, 50, 50, 55, 55) === 2);
ok('67% justo es verde', API.decidir(67, 50, 50, 55, 55) === 2);
ok('66% es amarillo', API.decidir(66, 50, 50, 55, 55) === 1);
ok('34% justo es amarillo', API.decidir(34, 50, 50, 55, 55) === 1);
ok('33% es rojo', API.decidir(33, 50, 50, 55, 55) === 0);
ok('baja un nivel si la VFC esta 10% abajo', API.decidir(80, 44, 50, 55, 55) === 1, API.decidir(80, 44, 50, 55, 55));
ok('baja un nivel si el pulso en reposo sube 4', API.decidir(80, 50, 50, 59, 55) === 1);
ok('no baja de rojo', API.decidir(20, 40, 50, 60, 55) === 0);
ok('sin recuperacion no decide', API.decidir(null, 50, 50, 55, 55) === null);

console.log('\nEl texto del aviso:');
{
  const plan = { decision: 'entrenar', title: 'Tempo en bloques', steps: [{ min: 15 }, { min: 45 }, { min: 15 }] };
  const a = API.textoDelDia(2, 72, plan, true);
  console.log('   ', a.titulo, '|', a.cuerpo);
  ok('dice la decision', /puedes entrenar/i.test(a.titulo), a.titulo);
  ok('dice la recuperacion', /72%/.test(a.cuerpo), a.cuerpo);
  ok('dice el entrenamiento', /Tempo en bloques/.test(a.cuerpo), a.cuerpo);
  ok('y cuanto dura', /75 min/.test(a.cuerpo), a.cuerpo);

  const d = API.textoDelDia(0, 28, { decision: 'descanso', title: 'Descanso' }, true);
  console.log('   ', d.titulo, '|', d.cuerpo);
  ok('un dia de descanso lo dice', /descansar/i.test(d.titulo), d.titulo);
  ok('y no inventa un entrenamiento', !/\d+ min/.test(d.cuerpo), d.cuerpo);
  ok('da algo que hacer igual', /Caminar/.test(d.cuerpo), d.cuerpo);

  const sinPlan = API.textoDelDia(1, 50, null, true);
  ok('sin plan igual dice la decision', /suave/i.test(sinPlan.titulo), sinPlan.titulo);
  const en = API.textoDelDia(2, 72, plan, false);
  ok('en ingles tambien', /Good to train/.test(en.titulo), en.titulo);
}

console.log('\nLa hora de cada quien, en su propia zona:');
{
  const cr = API.alla('America/Costa_Rica');
  const tokio = API.alla('Asia/Tokyo');
  ok('da un dia valido', /^\d{4}-\d{2}-\d{2}$/.test(cr.dia), cr.dia);
  ok('da una hora valida', cr.hora >= 0 && cr.hora <= 23, cr.hora);
  ok('zonas distintas dan horas distintas', cr.hora !== tokio.hora, `${cr.hora} vs ${tokio.hora}`);
  ok('una zona inventada no revienta', /^\d{4}-\d{2}-\d{2}$/.test(API.alla('No/Existe').dia));
}

console.log('\nLas reglas de cuando avisar (leidas del archivo):');
ok('no avisa de madrugada', DESDE_HORA >= 4, DESDE_HORA);
ok('se rinde en la manana, no de noche', RENDIRSE_HORA >= 8 && RENDIRSE_HORA <= 11, RENDIRSE_HORA);
ok('espera un rato antes de rendirse', RENDIRSE_HORA > DESDE_HORA, `${DESDE_HORA} a ${RENDIRSE_HORA}`);
ok('se marca el dia avisado para no repetir', /avisado_el: dia/.test(SRC));
ok('salta a quien ya se le aviso hoy', /s\.avisado_el === dia/.test(SRC));
ok('borra los aparatos que ya no existen', /404 \|\| code === 410/.test(SRC));
ok('un aviso por dia, no se amontonan', /tag: 'rr-' \+ dia/.test(SRC));
// Se mira que no haya una llamada de verdad, no la palabra suelta: el propio comentario
// del archivo dice "esto NO llama a Claude" y la comprobacion anterior se cazaba sola.
ok('NO llama a Claude', !/api\.anthropic\.com|ANTHROPIC_API_KEY/.test(SRC));
ok('la llave privada no esta en el codigo', !/VAPID_PRIVATE\s*=\s*['"][A-Za-z0-9_-]{20,}/.test(SRC));
ok('la llave privada viene del servidor', /Deno\.env\.get\('VAPID_PRIVATE_KEY'\)/.test(SRC));

console.log('\nEl boton de la app:');
{
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
  const dom = new JSDOM('<!doctype html><html><body><div id="dash-root"><div class="jx">'
    + '<div class="bar"><button type="button" id="btn-refresh">Actualizar</button></div></div></div></body></html>',
    { runScripts: 'outside-only', virtualConsole: vc, url: 'https://example.test/' });
  const { window } = dom;
  window.localStorage.setItem('rr_lang', 'es');
  window.eval(`
    window.__guardado = null; window.__borrado = null;
    window.dash = { data: () => ({status:'missing',data:[]}), onData: () => {}, params: () => ({lang:'es'}),
      setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
    window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }), onAuthStateChange: () => {}, signOut: async () => ({}) },
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }),
        upsert: async (f) => { window.__guardado = f; return { error: null }; },
        delete: () => ({ eq: () => ({ eq: async () => { window.__borrado = true; return { error: null }; } }) }) }),
      functions: { invoke: async () => ({ data: {}, error: null }) } }) };`);
  window.eval(fs.readFileSync(path.join(ROOT, 'account.js'), 'utf8'));

  (async () => {
    await new Promise((r) => setTimeout(r, 80));
    const doc = window.document;
    doc.getElementById('btn-account').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    const btn = doc.getElementById('ra-av-btn');
    ok('hay un boton de avisos', !!btn);
    ok('explica que solo va con la app instalada', /instalada desde el icono/.test(doc.getElementById('ra-av-p').textContent),
      doc.getElementById('ra-av-p').textContent.slice(0, 80));
    // jsdom no tiene PushManager, igual que un iPhone viejo o Safari sin instalar.
    ok('si el telefono no puede, lo dice en vez de fallar', /iOS 16.4/.test(doc.getElementById('ra-av-st').textContent),
      doc.getElementById('ra-av-st').textContent.slice(0, 90));
    ok('y deja el boton apagado', btn.disabled === true);
    ok('no ofrece el de prueba', doc.getElementById('ra-av-test').hidden === true);
    ok('la llave publica esta en la app', /BI0sJLWB/.test(fs.readFileSync(path.join(ROOT, 'account.js'), 'utf8')));
    // Las llaves publicas tienen 87 caracteres; las privadas, 43. En la app solo puede
    // haber una, y tiene que ser la publica.
    const ac = fs.readFileSync(path.join(ROOT, 'account.js'), 'utf8');
    // Se miran solo las de forma de llave de avisos (base64url). La clave publicable de
    // Supabase tambien vive aqui, pero esa es publica a proposito y lleva su prefijo.
    const llaves = (ac.match(/'[A-Za-z0-9_-]{40,90}'/g) || []).map((x) => x.slice(1, -1))
      .filter((k) => !k.startsWith('sb_'));
    ok('solo hay una llave de avisos', llaves.length === 1, llaves.map((k) => k.length).join(','));
    ok('y es la publica, de 87', llaves[0] && llaves[0].length === 87, llaves[0] && llaves[0].length);
    ok('ninguna llave privada de 43', !llaves.some((k) => k.length === 43));

    console.log('\nEl trabajador en segundo plano:');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    ok('escucha los avisos', /addEventListener\('push'/.test(sw));
    ok('los muestra', /showNotification/.test(sw));
    ok('al tocarlo abre la app', /notificationclick/.test(sw));
    ok('si ya esta abierta la trae al frente', /focus/.test(sw));
    ok('aguanta un aviso sin datos', /catch \(err\)/.test(sw));

    console.log('\nErrores:', errors.length ? errors : 'ninguno');
    if (errors.length) fail++;
    console.log(`\n${pass} pasaron, ${fail} fallaron`);
    process.exit(fail ? 1 : 0);
  })();
}
