// Ride Ready: el chat del entrenador. Una burbuja fija en la esquina; al tocarla se abre
// la conversacion. Lo que escribes va a la funcion coach-chat del servidor, que le pregunta
// a Claude con tus numeros de hoy y puede ajustar el entrenamiento.
(function () {
  const T = {
    es: {
      open: 'Hablar con el entrenador', title: 'Tu entrenador', close: 'Cerrar',
      ph: 'Escribe lo que quieras preguntar…', send: 'Enviar',
      hello: '¿Qué tal? Pregúntame lo que sea de tu entrenamiento de hoy, o pídeme que lo cambie: "solo tengo 40 minutos", "amanecí mal", "hoy no puedo".',
      need_account: 'Entra a tu cuenta para hablar conmigo. Toca "Cuenta" arriba.',
      thinking: 'Pensando…', changed: 'Entrenamiento actualizado.', planned: 'Tu plan quedó guardado.',
      err: 'No pude responder. Intenta de nuevo.',
      left: (n) => `Te quedan ${n} mensajes hoy.`,
    },
    en: {
      open: 'Talk to your coach', title: 'Your coach', close: 'Close',
      ph: 'Ask me anything…', send: 'Send',
      hello: "Hey. Ask me anything about today's training, or tell me to change it: \"I only have 40 minutes\", \"I feel rough\", \"I can't ride today\".",
      need_account: 'Sign in to talk to me. Tap "Account" above.',
      thinking: 'Thinking…', changed: 'Workout updated.', planned: 'Your plan is saved.',
      err: "I couldn't answer. Try again.",
      left: (n) => `${n} messages left today.`,
    },
  };
  const lang = () => { try { const v = localStorage.getItem('rr_lang'); if (v === 'en' || v === 'es') return v; } catch (e) {} return 'es'; };
  const t = (k) => T[lang()][k];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const css = `
  .rc-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:60;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;
    background:linear-gradient(145deg,#FFD60A,#FF9F0A 55%,#FF6B00);color:#1d1d1f;box-shadow:0 8px 24px rgba(0,0,0,.45);display:grid;place-items:center;padding:0}
  .rc-fab:active{transform:scale(.94)}
  .rc-fab svg{width:27px;height:27px}
  .rc-sheet{position:fixed;inset:0;z-index:61;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .rc-sheet[hidden]{display:none}
  .rc-panel{width:100%;max-width:560px;height:86vh;display:flex;flex-direction:column;background:rgba(28,28,32,.97);border:1px solid var(--hair);
    border-radius:24px 24px 0 0;color:var(--ink);box-shadow:0 -12px 40px rgba(0,0,0,.5)}
  .rc-top{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 10px;border-bottom:1px solid var(--hair)}
  .rc-top h2{font-size:20px;margin:0;font-weight:700}
  .rc-x{appearance:none;border:1px solid var(--hair);background:var(--glass2);color:var(--ink);border-radius:999px;padding:8px 14px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer}
  .rc-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
  .rc-msg{max-width:86%;padding:10px 13px;border-radius:17px;font-size:15px;line-height:1.42;white-space:pre-wrap;word-wrap:break-word}
  .rc-msg.me{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:5px}
  .rc-msg.coach{align-self:flex-start;background:rgba(255,255,255,.09);border:1px solid var(--hair);border-bottom-left-radius:5px}
  .rc-msg.note{align-self:center;background:rgba(255,159,10,.16);border:1px solid rgba(255,159,10,.4);font-size:13px;padding:7px 12px;border-radius:999px}
  .rc-msg.bad{align-self:center;background:rgba(255,69,58,.16);border:1px solid rgba(255,69,58,.4);font-size:13px;padding:7px 12px;border-radius:999px}
  .rc-dots{align-self:flex-start;display:flex;gap:4px;padding:12px 14px}
  .rc-dots i{width:7px;height:7px;border-radius:50%;background:var(--ink3);animation:rcDot 1.1s infinite}
  .rc-dots i:nth-child(2){animation-delay:.16s}.rc-dots i:nth-child(3){animation-delay:.32s}
  @keyframes rcDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
  .rc-bar{display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--hair)}
  .rc-bar textarea{flex:1;resize:none;min-height:42px;max-height:110px;padding:11px 13px;border-radius:17px;border:1px solid var(--hair);
    background:rgba(255,255,255,.08);color:var(--ink);font:400 16px/1.35 -apple-system,system-ui,sans-serif}
  .rc-go{appearance:none;border:0;border-radius:50%;width:42px;height:42px;background:var(--blue);color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}
  .rc-go:disabled{opacity:.45}
  .rc-go svg{width:20px;height:20px}
  @media (prefers-reduced-motion: reduce){.rc-dots i{animation:none}}`;

  let open = false, busy = false;
  const history = [];   // solo esta sesion; no se guarda nada

  function add(kind, text) {
    const log = $('rc-log'); if (!log) return null;
    const m = el('div', 'rc-msg ' + kind, text);
    log.appendChild(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  function dots(on) {
    const log = $('rc-log'); if (!log) return;
    const old = $('rc-dots'); if (old) old.remove();
    if (!on) return;
    const d = el('div', 'rc-dots'); d.id = 'rc-dots';
    d.appendChild(el('i')); d.appendChild(el('i')); d.appendChild(el('i'));
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }

  async function send() {
    const box = $('rc-in'); const text = (box.value || '').trim();
    if (!text || busy) return;
    if (!window.rrAccount || !window.rrAccount.chat) { add('bad', t('err')); return; }
    box.value = ''; box.style.height = 'auto';
    add('me', text);
    history.push({ role: 'user', content: text });
    busy = true; $('rc-go').disabled = true; dots(true);
    try {
      const ctx = window.rrCoach ? window.rrCoach.context() : {};
      const data = await window.rrAccount.chat({ messages: history.slice(-20), context: ctx });
      dots(false);
      const reply = (data && data.text) || t('err');
      add('coach', reply);
      history.push({ role: 'assistant', content: reply });
      if (window.rrCoach) {
        const acts = (data && Array.isArray(data.actions) && data.actions.length) ? data.actions : (data && data.action ? [data.action] : []);
        if (acts.length) { window.rrCoach.applyAll(acts); add('note', t('changed')); }
        // El plan y las metas ya quedaron guardados en el servidor: hay que traerlos.
        if (data && data.reload) { window.rrCoach.reload(); add('note', t('planned')); }
      }
      if (data && typeof data.left === 'number' && data.left <= 5) add('note', t('left')(data.left));
    } catch (e) {
      dots(false);
      add('bad', (e && e.message) ? e.message : t('err'));
    }
    busy = false; $('rc-go').disabled = false;
  }

  function show(v) {
    open = v;
    const sh = $('rc-sheet'); if (!sh) return;
    sh.hidden = !v;
    if (!v) return;
    labels();
    const log = $('rc-log');
    if (!log.children.length) {
      const signed = !!(window.rrAccount && window.rrAccount.signedIn && window.rrAccount.signedIn());
      add('coach', signed ? t('hello') : t('need_account'));
    }
    setTimeout(() => { const i = $('rc-in'); if (i) i.focus(); }, 60);
  }

  function labels() {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('rc-title', t('title')); set('rc-x', t('close'));
    const i = $('rc-in'); if (i) i.placeholder = t('ph');
    const f = $('rc-fab'); if (f) f.setAttribute('aria-label', t('open'));
  }

  function build() {
    const root = document.querySelector('#dash-root .jx') || document.body;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const fab = el('button', 'rc-fab'); fab.type = 'button'; fab.id = 'rc-fab';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg>';
    fab.addEventListener('click', () => show(true));
    root.appendChild(fab);

    const sh = el('div', 'rc-sheet'); sh.id = 'rc-sheet'; sh.hidden = true;
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'rc-title');
    sh.innerHTML = `<div class="rc-panel">
      <div class="rc-top"><h2 id="rc-title"></h2><button type="button" class="rc-x" id="rc-x"></button></div>
      <div class="rc-log" id="rc-log"></div>
      <div class="rc-bar">
        <textarea id="rc-in" rows="1" autocomplete="off"></textarea>
        <button type="button" class="rc-go" id="rc-go" aria-label="Enviar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
    </div>`;
    root.appendChild(sh);

    sh.addEventListener('click', (e) => { if (e.target === sh) show(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) show(false); });
    $('rc-x').addEventListener('click', () => show(false));
    $('rc-go').addEventListener('click', send);
    const box = $('rc-in');
    box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = Math.min(110, box.scrollHeight) + 'px'; });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const sw = document.getElementById('lang-sw'); if (sw) sw.addEventListener('click', () => setTimeout(labels, 0));
    labels();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
