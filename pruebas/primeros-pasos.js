// La guia de primeros pasos: que se abra sola cuando falta configurar, que marque
// como hecho solo lo que de verdad esta hecho, y que no moleste a quien ya termino.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'public');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('ERROR: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

// ESTADO: lo que devolveria rrAccount.status(). VISTA: si ya vio la guia antes.
function run(ESTADO, { vista = false, lang = 'es' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="dash-root"><div class="jx">'
    + '<div class="bar"><button type="button" id="btn-refresh">Actualizar</button>'
    + '<button type="button" id="btn-account">Cuenta</button></div>'
    + '<button type="button" id="lang-sw">ES/EN</button></div></div></body></html>',
    { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  window.localStorage.setItem('rr_lang', lang);
  if (vista) window.localStorage.setItem('rr_guia_vista', '1');
  window.eval(`window.__st = ${JSON.stringify(ESTADO)};
    window.__abrioCuenta = false;
    window.rrAccount = { signedIn: () => window.__st.signedIn,
      status: async () => window.__st,
      openPanel: () => { window.__abrioCuenta = true; } };`);
  window.eval(fs.readFileSync(path.join(ROOT, 'primeros-pasos.js'), 'utf8'));
  return window;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LISTO = { signedIn: true, email: 'a@b.c', hasKey: true, activities: 842, wellness: 400 };
const NADA = { signedIn: false, hasKey: false, activities: 0, wellness: 0 };
const MEDIAS = { signedIn: true, email: 'a@b.c', hasKey: false, activities: 0, wellness: 0 };

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FALLA', n, extra != null ? '-> ' + extra : ''); } };
const pasos = (w) => [...w.document.querySelectorAll('.pp-step')].map((s) => ({
  n: (s.querySelector('.pp-n') || {}).textContent,
  t: (s.querySelector('.pp-t') || {}).textContent || '',
  hecho: s.classList.contains('ok'),
}));

(async () => {
  console.log('Amigo nuevo, sin nada configurado:');
  let w = run(NADA);
  await wait(1200);
  ok('la guia se abre sola', !w.document.getElementById('pp-sheet').hidden);
  let p = pasos(w);
  ok('muestra los 7 pasos', p.length === 7, p.length);
  ok('ninguno aparece como hecho', p.every((x) => !x.hecho), p.filter((x) => x.hecho).map((x) => x.t).join(', '));
  ok('empieza por crear la cuenta de intervals.icu', /intervals\.icu/.test(p[0].t), p[0].t);
  const links = [...w.document.querySelectorAll('.pp-sheet a.pp-go')];
  ok('los enlaces llevan a intervals.icu', links.length >= 2 && links.every((a) => a.href.startsWith('https://intervals.icu')), links.map((a) => a.href).join(' '));
  ok('los enlaces abren fuera, de forma segura', links.every((a) => a.target === '_blank' && /noopener/.test(a.rel)));
  ok('avisa de no conectar Strava', /Strava/.test(w.document.getElementById('pp-body').textContent));
  ok('dice que Whoop es opcional', /Opcional|opcional/.test(w.document.getElementById('pp-body').textContent));
  ok('no promete nada guardado todavia', !/Guardado:/.test(w.document.getElementById('pp-body').textContent));

  console.log('\nEl boton de entrar con el correo abre la pantalla Cuenta:');
  const b = [...w.document.querySelectorAll('.pp-go.primary')][0];
  ok('existe el boton', !!b);
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(30);
  ok('abre Cuenta', w.__abrioCuenta === true);
  ok('y cierra la guia', w.document.getElementById('pp-sheet').hidden);

  console.log('\nYa entro con su correo, pero falta la clave:');
  w = run(MEDIAS);
  await wait(1200);
  ok('la guia se abre igual', !w.document.getElementById('pp-sheet').hidden);
  p = pasos(w);
  ok('el paso del correo sale como hecho', p[4].hecho, p[4].t);
  ok('el de traer los datos sigue pendiente', !p[5].hecho, p[5].t);
  ok('el tilde aparece en el paso hecho', p[4].n === '✓', p[4].n);

  console.log('\nTodo configurado:');
  w = run(LISTO);
  await wait(1200);
  ok('NO se abre sola, no molesta', w.document.getElementById('pp-sheet').hidden);
  w.document.getElementById('btn-guia').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok('pero se puede abrir a mano', !w.document.getElementById('pp-sheet').hidden);
  p = pasos(w);
  ok('los pasos que la app puede comprobar salen hechos', p[4].hecho && p[5].hecho && p[6].hecho);
  const cuerpo = w.document.getElementById('pp-body').textContent;
  ok('dice que ya esta todo listo', /todo listo/i.test(cuerpo), cuerpo.slice(-90));
  ok('dice cuanto hay guardado', /842/.test(cuerpo) && /400/.test(cuerpo));

  console.log('\nYa la vio antes y todavia le falta:');
  w = run(MEDIAS, { vista: true });
  await wait(1200);
  ok('no se abre sola una segunda vez', w.document.getElementById('pp-sheet').hidden);
  ok('el boton sigue ahi para volver', !!w.document.getElementById('btn-guia'));

  console.log('\nEn ingles:');
  w = run(NADA, { lang: 'en' });
  await wait(1200);
  p = pasos(w);
  ok('los pasos estan en ingles', /Create your intervals\.icu account/.test(p[0].t), p[0].t);
  ok('el boton tambien', /Getting started/.test(w.document.getElementById('btn-guia-l').textContent));

  console.log('\nSi no hay cuenta conectada (sin rrAccount):');
  const w2 = run(NADA, { vista: true });
  await wait(1200);
  w2.eval('delete window.rrAccount;');
  w2.document.getElementById('btn-guia').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok('no revienta, igual muestra los pasos', pasos(w2).length === 7);

  console.log('\nErrores de la app:', errors.length ? errors : 'ninguno');
  if (errors.length) fail++;
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
