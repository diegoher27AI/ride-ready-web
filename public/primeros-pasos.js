// Ride Ready: la guia de primeros pasos. Se abre sola la primera vez que alguien entra
// sin la cuenta lista, y marca cada paso como hecho mirando el estado de verdad, no
// suponiendo. Despues queda disponible en el boton "Primeros pasos".
(function () {
  const KEY = 'rr_guia_vista';
  const APP = 'https://intervals.icu';

  const T = {
    es: {
      open: 'Primeros pasos', title: 'Primeros pasos', close: 'Cerrar', later: 'Después',
      intro: 'Unos 15 minutos la primera vez. Después la app se actualiza sola.',
      done: 'Listo', pending: 'Falta',
      s1t: 'Creá tu cuenta en intervals.icu',
      s1d: 'Es gratis. Ahí llegan tus entrenamientos, y de ahí los lee Ride Ready.',
      s1b: 'Abrir intervals.icu',
      s2t: 'Conectá tu Garmin, Wahoo, Zwift o Karoo',
      s2d: 'En intervals.icu, entrá a Settings y conectá lo que uses. No conectés Strava: te duplicaría cada entrenamiento y tu fatiga saldría al doble.',
      s2b: 'Abrir los ajustes',
      s3t: 'Conectá tu Whoop, si tenés',
      s3d: 'Opcional. Se usan solo recuperación, variabilidad del pulso, pulso en reposo y sueño. Sin Whoop igual ves tu forma física, tu fatiga y el entrenador.',
      s4t: 'Copiá tu clave de intervals.icu',
      s4d: 'En Settings, bajá hasta Developer Settings. Ahí está tu API Key. Tratala como una contraseña: no se la pases a nadie.',
      s4b: 'Abrir los ajustes',
      s5t: 'Entrá con tu correo',
      s5d: 'Sin contraseña. Te llega un código de 6 números. Escribilo en la app; si el correo trae un enlace, no lo toques.',
      s5b: 'Entrar con mi correo',
      s6t: 'Pegá tu clave y traé tus datos',
      s6d: 'En Cuenta, pegá la clave, tocá Guardar y después Traer mis datos. La primera vez tarda: trae hasta 3 años.',
      s6b: 'Abrir Cuenta',
      s7t: 'Pedile a tu entrenador',
      s7d: 'La burbuja naranja de abajo. Escribile como a una persona: "solo tengo 40 minutos", "amanecí mal", "mi meta es el Haute Route en agosto".',
      okAll: 'Ya está todo listo. Cada mañana abrí la app y tocá Actualizar.',
      sofar: (a, w) => `Guardado: ${a} actividades y ${w} días de bienestar.`,
    },
    en: {
      open: 'Getting started', title: 'Getting started', close: 'Close', later: 'Later',
      intro: 'About 15 minutes the first time. After that the app updates itself.',
      done: 'Done', pending: 'To do',
      s1t: 'Create your intervals.icu account',
      s1d: 'Free. Your workouts land there, and Ride Ready reads them from there.',
      s1b: 'Open intervals.icu',
      s2t: 'Connect your Garmin, Wahoo, Zwift or Karoo',
      s2d: 'In intervals.icu, go to Settings and connect what you actually use. Do not connect Strava: it would duplicate every ride and double your fatigue.',
      s2b: 'Open settings',
      s3t: 'Connect your Whoop, if you have one',
      s3d: 'Optional. Only recovery, heart rate variability, resting heart rate and sleep are used. Without Whoop you still get fitness, fatigue and the coach.',
      s4t: 'Copy your intervals.icu key',
      s4d: 'In Settings, scroll down to Developer Settings. Your API Key is there. Treat it like a password.',
      s4b: 'Open settings',
      s5t: 'Sign in with your email',
      s5d: 'No password. You get a 6-digit code. Type it into the app; if the email has a link, do not tap it.',
      s5b: 'Sign in with my email',
      s6t: 'Paste your key and fetch your data',
      s6d: 'In Account, paste the key, tap Save, then Fetch my data. The first time takes a while: it pulls up to 3 years.',
      s6b: 'Open Account',
      s7t: 'Ask your coach',
      s7d: 'The orange bubble below. Talk to it like a person: "I only have 40 minutes", "I feel rough", "my goal is Haute Route in August".',
      okAll: 'All set. Each morning open the app and tap Refresh.',
      sofar: (a, w) => `Stored: ${a} activities and ${w} wellness days.`,
    },
  };
  const lang = () => { try { const v = localStorage.getItem('rr_lang'); if (v === 'en' || v === 'es') return v; } catch (e) {} return 'es'; };
  const t = (k) => T[lang()][k];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const css = `
  .pp-sheet{position:fixed;inset:0;z-index:62;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .pp-sheet[hidden]{display:none}
  .pp-panel{width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;background:rgba(28,28,32,.98);border:1px solid var(--hair);
    border-radius:24px 24px 0 0;color:var(--ink);box-shadow:0 -12px 40px rgba(0,0,0,.5)}
  .pp-top{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 12px;border-bottom:1px solid var(--hair)}
  .pp-top h2{font-size:21px;margin:0;font-weight:700}
  .pp-x{appearance:none;border:1px solid var(--hair);background:var(--glass2);color:var(--ink);border-radius:999px;padding:8px 14px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer}
  .pp-body{flex:1;overflow-y:auto;padding:14px 18px 20px;-webkit-overflow-scrolling:touch}
  .pp-intro{color:var(--ink2);font-size:14px;margin:0 0 14px}
  .pp-step{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid var(--hair)}
  .pp-step:last-child{border-bottom:0}
  .pp-n{flex:none;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font:700 13px -apple-system,system-ui,sans-serif;
    background:rgba(255,255,255,.1);border:1px solid var(--hair);color:var(--ink2)}
  .pp-step.ok .pp-n{background:#30D158;border-color:#30D158;color:#06230f}
  .pp-c{flex:1;min-width:0}
  .pp-t{font-weight:650;font-size:16px;margin:1px 0 3px}
  .pp-step.ok .pp-t{color:var(--ink2)}
  .pp-d{color:var(--ink2);font-size:14px;line-height:1.42;margin:0}
  .pp-go{appearance:none;margin-top:9px;border:1px solid var(--hair);background:var(--glass2);color:var(--ink);border-radius:999px;
    padding:8px 15px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-block}
  .pp-go.primary{background:linear-gradient(145deg,#FFD60A,#FF9F0A 55%,#FF6B00);color:#1d1d1f;border:0}
  .pp-tag{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#30D158;margin-left:7px}
  .pp-all{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:rgba(48,209,88,.14);border:1px solid rgba(48,209,88,.4);font-size:14px}
  .pp-sofar{color:var(--ink3);font-size:13px;margin:8px 0 0}`;

  let st = { signedIn: false, hasKey: false, activities: 0, wellness: 0 };

  // Los pasos que la app puede comprobar sola quedan marcados; los de intervals.icu no,
  // porque desde aqui no se puede saber si el ciclista ya los hizo. No se inventa.
  function steps() {
    return [
      { k: 's1', out: APP },
      { k: 's2', out: APP + '/settings' },
      { k: 's3' },
      { k: 's4', out: APP + '/settings' },
      { k: 's5', ok: st.signedIn, act: 'account' },
      { k: 's6', ok: st.signedIn && st.hasKey && st.activities > 0, act: 'account' },
      { k: 's7', ok: st.activities > 0, act: 'coach' },
    ];
  }

  function render() {
    const body = $('pp-body'); if (!body) return;
    body.replaceChildren();
    const p = el('p', 'pp-intro', t('intro')); body.appendChild(p);
    steps().forEach((s, i) => {
      const row = el('div', 'pp-step' + (s.ok ? ' ok' : ''));
      row.appendChild(el('div', 'pp-n', s.ok ? '✓' : String(i + 1)));
      const c = el('div', 'pp-c');
      const h = el('div', 'pp-t', t(s.k + 't'));
      if (s.ok) h.appendChild(el('span', 'pp-tag', t('done')));
      c.appendChild(h);
      c.appendChild(el('p', 'pp-d', t(s.k + 'd')));
      if (!s.ok && s.out) {
        const a = el('a', 'pp-go', t(s.k + 'b'));
        a.href = s.out; a.target = '_blank'; a.rel = 'noopener noreferrer';
        c.appendChild(a);
      } else if (!s.ok && s.act === 'account') {
        const b = el('button', 'pp-go primary', t(s.k + 'b')); b.type = 'button';
        b.addEventListener('click', () => { show(false); if (window.rrAccount && window.rrAccount.openPanel) window.rrAccount.openPanel(); });
        c.appendChild(b);
      }
      row.appendChild(c);
      body.appendChild(row);
    });
    if (st.activities > 0) {
      body.appendChild(el('div', 'pp-all', t('okAll')));
      body.appendChild(el('p', 'pp-sofar', t('sofar')(st.activities, st.wellness)));
    }
  }

  async function refresh() {
    if (window.rrAccount && window.rrAccount.status) {
      try { st = await window.rrAccount.status(); } catch (e) {}
    }
    render();
  }

  function show(v) {
    const sh = $('pp-sheet'); if (!sh) return;
    sh.hidden = !v;
    if (!v) return;
    labels();
    refresh();
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function labels() {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('pp-title', t('title')); set('pp-x', t('close'));
    const b = $('btn-guia-l'); if (b) b.textContent = t('open');
  }

  function build() {
    const root = document.querySelector('#dash-root .jx') || document.body;
    const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);

    // El boton va al lado de Cuenta, en la misma fila.
    const anchor = $('btn-account') || $('btn-load') || $('btn-refresh');
    if (anchor && !$('btn-guia')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ub'; b.id = 'btn-guia';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.2 2.9c-.5.2-.8.7-.8 1.2v.4"/><path d="M12 17h.01"/></svg><span id="btn-guia-l"></span>';
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
      b.addEventListener('click', () => show(true));
    }

    const sh = el('div', 'pp-sheet'); sh.id = 'pp-sheet'; sh.hidden = true;
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'pp-title');
    sh.innerHTML = `<div class="pp-panel">
      <div class="pp-top"><h2 id="pp-title"></h2><button type="button" class="pp-x" id="pp-x"></button></div>
      <div class="pp-body" id="pp-body"></div>
    </div>`;
    root.appendChild(sh);
    sh.addEventListener('click', (e) => { if (e.target === sh) show(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.hidden) show(false); });
    $('pp-x').addEventListener('click', () => show(false));
    const sw = $('lang-sw'); if (sw) sw.addEventListener('click', () => setTimeout(() => { labels(); if (!$('pp-sheet').hidden) render(); }, 0));
    labels();

    // Se abre sola la primera vez, y solo si de verdad falta configurar algo.
    setTimeout(async () => {
      let vista = false;
      try { vista = localStorage.getItem(KEY) === '1'; } catch (e) {}
      if (vista) return;
      if (window.rrAccount && window.rrAccount.status) {
        try { st = await window.rrAccount.status(); } catch (e) {}
      }
      if (!st.signedIn || !st.hasKey || !st.activities) show(true);
    }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
