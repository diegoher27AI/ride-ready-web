// Ride Ready: cuenta e inicio de sesion. Guarda la clave de intervals.icu en el servidor
// (protegida, solo el dueno de la cuenta la puede leer). La app sigue funcionando sin
// iniciar sesion, con los datos de ejemplo o los que cargues a mano.
(function () {
  const SUPABASE_URL = 'https://dbyewzuvpknamkpcaqcc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6nWi9MryrXpuCBvv7QMPOQ_mkYS97sk';
  const T = {
    es: {
      btn: 'Cuenta', title: 'Tu cuenta', close: 'Cerrar',
      intro: 'Entra con tu correo para guardar tu conexion con intervals.icu. No hace falta contrasena.',
      email: 'Tu correo', send: 'Enviar codigo', sent: 'Revisa tu correo y escribe aqui el codigo de 6 numeros.',
      bad_email: 'Escribe un correo valido.',
      code: 'Codigo de 6 numeros', confirm: 'Confirmar codigo', bad_code: 'Ese codigo no es valido o ya vencio.',
      signed_as: (e) => `Conectado como ${e}`, signout: 'Cerrar sesion',
      iv_h: 'Conexion con intervals.icu', iv_p: 'Pega tu clave de intervals.icu (Settings, API Key en tu cuenta de intervals.icu).',
      iv_key: 'Clave de API', iv_athlete: 'ID de atleta (opcional)', save: 'Guardar', saved: 'Guardado.',
      connected: 'Ya tienes una conexion guardada.', not_connected: 'Todavia no has guardado tu clave.',
      err: 'Algo salio mal, intenta de nuevo.',
      sync: 'Traer mis datos', syncing: 'Trayendo tus datos de intervals.icu…',
      sync_ok: (a, w, d) => `Listo: ${a} actividades y ${w} dias de bienestar.`
        + (d ? ` Tu ultima recuperacion es del ${d}.` : ''),
      have: (a, d1, d2, w, wd) => `Guardado en tu cuenta: ${a} actividades, de ${d1} a ${d2}. Bienestar: ${w} dias, el ultimo ${wd}.`,
      have_none: 'Todavia no hay nada guardado. Toca "Traer mis datos".',
    },
    en: {
      btn: 'Account', title: 'Your account', close: 'Close',
      intro: 'Sign in with your email to save your intervals.icu connection. No password needed.',
      email: 'Your email', send: 'Send code', sent: 'Check your email and type the 6-digit code here.',
      bad_email: 'Enter a valid email.',
      code: '6-digit code', confirm: 'Confirm code', bad_code: 'That code is wrong or expired.',
      signed_as: (e) => `Signed in as ${e}`, signout: 'Sign out',
      iv_h: 'intervals.icu connection', iv_p: 'Paste your intervals.icu key (Settings, API Key in your intervals.icu account).',
      iv_key: 'API key', iv_athlete: 'Athlete ID (optional)', save: 'Save', saved: 'Saved.',
      connected: 'You already have a saved connection.', not_connected: "You haven't saved your key yet.",
      err: 'Something went wrong, try again.',
      sync: 'Fetch my data', syncing: 'Fetching your data from intervals.icu…',
      sync_ok: (a, w, d) => `Done: ${a} activities and ${w} wellness days.`
        + (d ? ` Your last recovery is from ${d}.` : ''),
      have: (a, d1, d2, w, wd) => `Stored in your account: ${a} activities, from ${d1} to ${d2}. Wellness: ${w} days, last one ${wd}.`,
      have_none: 'Nothing stored yet. Tap "Fetch my data".',
    },
  };
  const lang = () => { try { const v = localStorage.getItem('rr_lang'); if (v === 'en' || v === 'es') return v; } catch (e) {} const p = window.dash && dash.params ? dash.params() : {}; return p && p.lang === 'en' ? 'en' : 'es'; };
  const t = (k) => T[lang()][k];
  const $ = (id) => document.getElementById(id);

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const css = `
  .ra-sheet{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .ra-sheet[hidden]{display:none}
  .ra-panel{width:100%;max-width:560px;max-height:88vh;overflow:auto;background:rgba(28,28,32,.96);border:1px solid var(--hair);border-radius:24px 24px 0 0;padding:18px 16px calc(24px + env(safe-area-inset-bottom,0px));color:var(--ink);box-shadow:0 -12px 40px rgba(0,0,0,.5)}
  .ra-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .ra-top h2{font-size:22px;margin:0;font-weight:700}
  .ra-x{appearance:none;border:1px solid var(--hair);background:var(--glass2);color:var(--ink);border-radius:999px;padding:8px 14px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer}
  .ra-sec{border-top:1px solid var(--hair);padding:14px 0}
  .ra-sec h3{font-size:16px;margin:0 0 4px;font-weight:600}
  .ra-sec p{font-size:13px;line-height:1.4;color:var(--ink2);margin:0 0 10px}
  .ra-btn{appearance:none;border:0;border-radius:14px;background:var(--blue);color:#fff;font:600 15px -apple-system,system-ui,sans-serif;padding:12px 16px;cursor:pointer;min-height:44px}
  .ra-st{font-size:13px;margin-top:8px;min-height:1.2em;color:var(--ink)}
  .ra-field{display:grid;gap:4px;font-size:12px;color:var(--ink2);font-weight:600;margin-bottom:10px}
  .ra-field input{width:100%;box-sizing:border-box;padding:10px;border-radius:12px;border:1px solid var(--hair);background:rgba(255,255,255,.08);color:var(--ink);font:600 16px/1 -apple-system,system-ui,sans-serif}
  .ra-link{appearance:none;background:none;border:0;color:var(--pink);font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer;padding:6px 0}
  .ra-btn:focus-visible,.ra-x:focus-visible,.ra-link:focus-visible{outline:2px solid #fff;outline-offset:2px}`;

  let session = null;

  function render() {
    if (!$('ra-sheet')) return;
    const signedIn = !!session;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('btn-account-l', t('btn')); set('ra-title', t('title')); set('ra-close', t('close'));
    $('ra-login').hidden = signedIn;
    $('ra-account').hidden = !signedIn;
    set('ra-intro', t('intro')); set('ra-l-email', t('email')); set('ra-send', t('send')); set('ra-l-code', t('code')); set('ra-confirm', t('confirm'));
    set('ra-iv-h', t('iv_h')); set('ra-iv-p', t('iv_p')); set('ra-l-key', t('iv_key')); set('ra-l-athlete', t('iv_athlete')); set('ra-save', t('save')); set('ra-sync', t('sync')); set('ra-signout', t('signout'));
    if (signedIn) set('ra-signed', t('signed_as')(session.user.email));
  }

  async function loadConnection() {
    if (!session) return;
    const { data } = await sb.from('intervals_connections').select('api_key, athlete_id').eq('user_id', session.user.id).maybeSingle();
    $('ra-key').value = data ? data.api_key : '';
    $('ra-athlete').value = (data && data.athlete_id) || '';
    $('ra-iv-st').textContent = data ? t('connected') : t('not_connected');
  }

  // Cuanto hay de verdad guardado en la cuenta. Sirve para contestar de un vistazo
  // "¿se cargo todo mi historico?" sin tener que abrir intervals.icu.
  async function showHave() {
    const box = $('ra-have'); if (!box || !session) return;
    const uid = session.user.id;
    const one = (tab, col, asc) => sb.from(tab).select(col).eq('user_id', uid).order(col, { ascending: asc }).limit(1);
    try {
      const [ca, cw, a1, a2, w2] = await Promise.all([
        sb.from('activities').select('date', { count: 'exact', head: true }).eq('user_id', uid),
        sb.from('wellness').select('date', { count: 'exact', head: true }).eq('user_id', uid),
        one('activities', 'date', true), one('activities', 'date', false), one('wellness', 'date', false),
      ]);
      const na = ca && ca.count ? ca.count : 0;
      const nw = cw && cw.count ? cw.count : 0;
      if (!na && !nw) { box.textContent = t('have_none'); return; }
      const d = (r) => (r && r.data && r.data[0] ? r.data[0].date : '—');
      box.textContent = t('have')(na, d(a1), d(a2), nw, d(w2));
    } catch (e) { box.textContent = ''; }
  }

  function open() { $('ra-sheet').hidden = false; render(); if (session) { loadConnection(); showHave(); } }
  function close() { $('ra-sheet').hidden = true; }

  function build() {
    const root = document.querySelector('#dash-root .jx') || document.body;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const anchor = $('btn-load') || $('btn-refresh');
    if (anchor && !$('btn-account')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ub'; b.id = 'btn-account';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span id="btn-account-l"></span>';
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
      b.addEventListener('click', open);
    }
    const sh = document.createElement('div'); sh.className = 'ra-sheet'; sh.id = 'ra-sheet'; sh.hidden = true;
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'ra-title');
    sh.innerHTML = `<div class="ra-panel">
      <div class="ra-top"><h2 id="ra-title"></h2><button type="button" class="ra-x" id="ra-close"></button></div>
      <div id="ra-login" class="ra-sec">
        <p id="ra-intro"></p>
        <div class="ra-field"><span id="ra-l-email"></span><input id="ra-email" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com"></div>
        <button type="button" class="ra-btn" id="ra-send"></button>
        <div class="ra-st" id="ra-login-st" role="status"></div>
        <div class="ra-field" id="ra-code-wrap" hidden><span id="ra-l-code"></span><input id="ra-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"></div>
        <button type="button" class="ra-btn" id="ra-confirm" hidden></button>
      </div>
      <div id="ra-account" class="ra-sec" hidden>
        <p id="ra-signed"></p>
        <h3 id="ra-iv-h"></h3><p id="ra-iv-p"></p>
        <div class="ra-field"><span id="ra-l-key"></span><input id="ra-key" autocomplete="off"></div>
        <div class="ra-field"><span id="ra-l-athlete"></span><input id="ra-athlete" autocomplete="off"></div>
        <button type="button" class="ra-btn" id="ra-save"></button>
        <div class="ra-st" id="ra-iv-st" role="status"></div>
        <button type="button" class="ra-btn" id="ra-sync" style="margin-top:10px"></button>
        <div class="ra-st" id="ra-sync-st" role="status"></div>
        <div class="ra-st" id="ra-have" role="status"></div>
        <button type="button" class="ra-link" id="ra-signout"></button>
      </div>
    </div>`;
    root.appendChild(sh);
    sh.addEventListener('click', (e) => { if (e.target === sh) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.hidden) close(); });
    $('ra-close').addEventListener('click', close);
    $('ra-send').addEventListener('click', onSend);
    $('ra-confirm').addEventListener('click', onConfirmCode);
    $('ra-save').addEventListener('click', onSave);
    $('ra-sync').addEventListener('click', onSync);
    $('ra-signout').addEventListener('click', onSignOut);
    render();
    const sw = document.getElementById('lang-sw'); if (sw) sw.addEventListener('click', () => setTimeout(render, 0));
  }

  async function onSend() {
    const email = $('ra-email').value.trim();
    if (!email || !email.includes('@')) { $('ra-login-st').textContent = t('bad_email'); return; }
    $('ra-send').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('ra-send').disabled = false;
    $('ra-login-st').textContent = error ? t('err') : t('sent');
    if (!error) { $('ra-code-wrap').hidden = false; $('ra-confirm').hidden = false; $('ra-code').focus(); }
  }

  async function onConfirmCode() {
    const email = $('ra-email').value.trim();
    const token = $('ra-code').value.trim();
    if (!email || !token) return;
    $('ra-confirm').disabled = true;
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    $('ra-confirm').disabled = false;
    $('ra-login-st').textContent = error ? t('bad_code') : '';
  }

  async function onSave() {
    const api_key = $('ra-key').value.trim();
    const athlete_id = $('ra-athlete').value.trim() || null;
    if (!api_key || !session) return;
    $('ra-save').disabled = true;
    const { error } = await sb.from('intervals_connections').upsert({ user_id: session.user.id, api_key, athlete_id });
    $('ra-save').disabled = false;
    $('ra-iv-st').textContent = error ? t('err') : t('saved');
  }

  // Llama a la funcion que trae lo nuevo de intervals.icu. La usan tanto el boton
  // de Cuenta como el "Actualizar" de la pantalla principal (si hay sesion iniciada).
  async function syncNow() {
    if (!session) return null;
    const { data, error } = await sb.functions.invoke('intervals-sync');
    if (error) {
      let detail = error.message || '';
      try { const body = await error.context.json(); if (body && body.error) detail = body.error; } catch (e) {}
      console.error('intervals-sync', error, detail);
      throw new Error(detail || t('err'));
    }
    return data;
  }

  // Manda el entrenamiento del dia al calendario de intervals.icu (de ahi llega solo al Garmin y al Karoo).
  async function sendWorkout(payload) {
    if (!session) return null;
    const { data, error } = await sb.functions.invoke('send-workout', { body: payload });
    if (error) {
      let detail = error.message || '';
      try { const body = await error.context.json(); if (body && body.error) detail = body.error; } catch (e) {}
      console.error('send-workout', error, detail);
      throw new Error(detail || t('err'));
    }
    return data;
  }
  // Le pregunta al entrenador. La clave de Claude vive en el servidor, nunca aqui.
  async function chat(payload) {
    if (!session) throw new Error(t('err'));
    const { data, error } = await sb.functions.invoke('coach-chat', { body: payload });
    if (error) {
      let detail = '';
      try { const body = await error.context.json(); if (body && body.error) detail = body.error; } catch (e) {}
      console.error('coach-chat', error, detail);
      throw new Error(detail || t('err'));
    }
    return data;
  }
  // En que punto va la configuracion. Lo usa la guia de primeros pasos para marcar
  // cada paso como hecho de verdad, en vez de dar por sentado que el ciclista lo hizo.
  async function status() {
    const base = { signedIn: !!session, email: session ? session.user.email : null, hasKey: false, activities: 0, wellness: 0 };
    if (!session) return base;
    const uid = session.user.id;
    try {
      const [conn, ca, cw] = await Promise.all([
        sb.from('intervals_connections').select('api_key').eq('user_id', uid).maybeSingle(),
        sb.from('activities').select('date', { count: 'exact', head: true }).eq('user_id', uid),
        sb.from('wellness').select('date', { count: 'exact', head: true }).eq('user_id', uid),
      ]);
      base.hasKey = !!(conn && conn.data && conn.data.api_key);
      base.activities = (ca && ca.count) || 0;
      base.wellness = (cw && cw.count) || 0;
    } catch (e) {}
    return base;
  }

  // Pide el bloque de la semana. Es la unica llamada a Claude que corre sola, y cuesta
  // unos 21 centavos, asi que el servidor la rechaza si ya hay uno reciente. El modelo
  // va ya calculado desde el telefono: Claude no entrena nada.
  async function planSemanal(payload) {
    if (!session) return null;
    const { data, error } = await sb.functions.invoke('plan-semanal', { body: payload || {} });
    if (error) {
      let detail = '';
      try { const b = await error.context.json(); if (b && b.error) detail = b.error; } catch (e) {}
      console.error('plan-semanal', error, detail);
      throw new Error(detail || t('err'));
    }
    return data;
  }

  // Las metas del ciclista. Se guardan en su cuenta, y solo el las ve.
  async function guardarMeta(m) {
    if (!session) throw new Error(t('err'));
    const fila = {
      user_id: session.user.id,
      name: String(m.name || '').slice(0, 120),
      goal_date: m.goal_date,
      end_date: m.end_date || null,
      priority: ['A', 'B', 'C'].includes(m.priority) ? m.priority : 'A',
      distance_km: m.distance_km != null ? m.distance_km : null,
      climb_m: m.climb_m != null ? m.climb_m : null,
      notes: m.notes ? String(m.notes).slice(0, 600) : null,
      sabe_ia: m.sabe_ia ? String(m.sabe_ia).slice(0, 900) : null,
    };
    const { data, error } = await sb.from('goals').insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async function borrarMeta(id) {
    if (!session) throw new Error(t('err'));
    const { error } = await sb.from('goals').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) throw new Error(error.message);
    return true;
  }
  async function listarMetas() {
    if (!session) return [];
    const { data } = await sb.from('goals').select('*').eq('user_id', session.user.id).order('goal_date', { ascending: true });
    return data || [];
  }
  // Le pregunta al entrenador que sabe del evento. Gasta un mensaje del cupo diario,
  // asi que solo se llama cuando el ciclista lo pide tocando el boton.
  async function investigarMeta(m) {
    if (!session) throw new Error(t('err'));
    const pregunta = `Voy a hacer "${m.name}"${m.goal_date ? ` el ${m.goal_date}` : ''}${m.end_date ? ` hasta el ${m.end_date}` : ''}.`
      + ` ¿Qué sabes de ese evento? Si lo reconoces, dime en 3 o 4 frases cómo es: distancia, desnivel, si es por etapas,`
      + ` qué tipo de esfuerzo exige y qué habría que entrenar. Si NO lo reconoces, dilo claramente y no inventes nada:`
      + ` di qué datos necesitas que yo te dé. No uses el guion largo.`;
    const data = await chat({ messages: [{ role: 'user', content: pregunta }], context: {} });
    return (data && data.text) || '';
  }

  window.rrAccount = { guardarMeta, borrarMeta, listarMetas, investigarMeta, syncNow, sendWorkout, chat, planSemanal, signedIn: () => !!session, status, openPanel: () => open() };

  async function onSync() {
    $('ra-sync').disabled = true;
    $('ra-sync-st').textContent = t('syncing');
    try {
      const data = await syncNow();
      $('ra-sync-st').textContent = t('sync_ok')(data.activities, data.wellness, data.last_recovery);
      showHave();
      if (window.dash && window.dash.refresh) window.dash.refresh();
    } catch (e) {
      $('ra-sync-st').textContent = t('err') + (e.message ? ' (' + e.message + ')' : '');
    }
    $('ra-sync').disabled = false;
  }

  async function onSignOut() { await sb.auth.signOut(); close(); }

  let lastUserId = null;
  function onSessionChange(s) {
    session = s; render();
    const uid = s && s.user ? s.user.id : null;
    if (uid && uid !== lastUserId) { loadConnection(); if (window.dash && window.dash.refresh) window.dash.refresh(); }   // solo al iniciar sesion de verdad, nunca al refrescar el token
    lastUserId = uid;
  }
  sb.auth.onAuthStateChange((_event, s) => onSessionChange(s));
  sb.auth.getSession().then(({ data }) => onSessionChange(data.session));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
