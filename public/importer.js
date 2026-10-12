// Ride Ready: "Load data" sheet. Imports a Whoop export (CSV files) and today's numbers typed by hand.
// Everything stays on this phone (local storage) until the server arrives.
// From the Whoop journal ONLY alcohol, added sugar and late meals are kept; every other answer is discarded.
(function () {
  const T = {
    es: {
      btn: 'Cargar datos', title: 'Cargar datos', close: 'Cerrar',
      w_h: 'Exportación de Whoop', w_p: 'En la app de Whoop: Perfil › Configuración de la app › Exportar datos. Te llega un correo con un archivo .zip; descomprímelo y elige aquí los archivos physiological_cycles.csv y journal_entries.csv.',
      w_btn: 'Elegir archivos', w_need: 'Falta physiological_cycles.csv: es el archivo con la recuperación, la VFC y el sueño.',
      w_ok: (n, a, b, j) => `Listo: ${n} días de recuperación (${a} a ${b})` + (j ? ` y ${j} días del diario.` : '.'),
      w_priv: 'Del diario solo se guardan alcohol, azúcar añadida y comida tarde.',
      d_h: 'Datos de hoy', d_p: 'Los números de Whoop de esta mañana, si no cargaste la exportación.',
      rec: 'Recuperación %', hrv: 'VFC ms', rhr: 'Pulso en reposo', sl: 'Sueño (h:mm)',
      alc: 'Alcohol ayer', sug: 'Azúcar añadida ayer', late: 'Comida tarde anoche',
      d_btn: 'Guardar datos de hoy', d_ok: 'Guardado para hoy.', d_bad: 'Escribe al menos la recuperación (0 a 100).',
      f_h: 'Archivos FIT de actividades', f_p: 'Muy pronto: subir actividades del Garmin o del Hammerhead cuando no se sincronicen solas.',
      local: 'Todo se guarda solo en este teléfono.', clear: 'Borrar lo cargado', cleared: 'Se borró lo cargado en este teléfono.',
      store_full: 'No hay espacio para guardar en este teléfono.'
    },
    en: {
      btn: 'Load data', title: 'Load data', close: 'Close',
      w_h: 'Whoop export', w_p: 'In the Whoop app: Profile › App settings › Data export. You get an email with a .zip file; unzip it and pick physiological_cycles.csv and journal_entries.csv here.',
      w_btn: 'Choose files', w_need: 'physiological_cycles.csv is missing: it holds recovery, HRV and sleep.',
      w_ok: (n, a, b, j) => `Done: ${n} days of recovery (${a} to ${b})` + (j ? ` and ${j} journal days.` : '.'),
      w_priv: 'From the journal only alcohol, added sugar and late meals are kept.',
      d_h: "Today's numbers", d_p: "This morning's Whoop numbers, if you didn't load the export.",
      rec: 'Recovery %', hrv: 'HRV ms', rhr: 'Resting HR', sl: 'Sleep (h:mm)',
      alc: 'Alcohol yesterday', sug: 'Added sugar yesterday', late: 'Late meal last night',
      d_btn: "Save today's numbers", d_ok: 'Saved for today.', d_bad: 'Enter at least recovery (0 to 100).',
      f_h: 'Activity FIT files', f_p: 'Coming soon: upload Garmin or Hammerhead activities when they do not sync on their own.',
      local: 'Everything is stored only on this phone.', clear: 'Delete loaded data', cleared: 'Loaded data deleted from this phone.',
      store_full: 'There is no room to save on this phone.'
    }
  };
  const lang = () => { try { const v = localStorage.getItem('rr_lang'); if (v === 'en' || v === 'es') return v; } catch (e) {} const p = window.dash && dash.params ? dash.params() : {}; return p && p.lang === 'en' ? 'en' : 'es'; };
  const t = (k) => T[lang()][k];
  const $ = (id) => document.getElementById(id);
  const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, '').trim());
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  const num = (x) => { const v = parseFloat(x); return isFinite(v) ? v : null; };

  // Same rules as the plugin's whoop_import.py.
  function importWhoop(cycles, journal) {
    const startToWake = {}, rows = [];
    cycles.forEach((c) => {
      const wake = (c['Wake onset'] || '').slice(0, 10);
      if (wake) startToWake[c['Cycle start time']] = wake;
      const rec = num(c['Recovery score %']);
      if (rec == null || !wake) return;
      const m = (k) => num(c[k]);
      rows.push({ date: wake, recovery: rec, hrv: m('Heart rate variability (ms)'), rhr: m('Resting heart rate (bpm)'),
        asleep_h: m('Asleep duration (min)') ? Math.round(m('Asleep duration (min)') / 60 * 100) / 100 : null,
        need_h: m('Sleep need (min)') ? Math.round(m('Sleep need (min)') / 60 * 100) / 100 : null,
        sleep_perf: m('Sleep performance %'), debt_min: m('Sleep debt (min)'), resp: m('Respiratory rate (rpm)'),
        deep_min: m('Deep (SWS) duration (min)'), rem_min: m('REM duration (min)'), source: 'export' });
    });
    const Q = { 'Have any alcoholic drinks?': 'alcohol', 'Consumed added sugar?': 'sugar', 'Ate food close to bedtime?': 'late_meal' };
    const flags = {};
    (journal || []).forEach((r) => {
      const k = Q[r['Question text']]; if (!k) return;          // every other journal answer is dropped here
      const wake = startToWake[r['Cycle end time']]; if (!wake) return;   // shows up in the next morning's recovery
      (flags[wake] = flags[wake] || {})[k] = String(r['Answered yes'] || '').toLowerCase() === 'true' ? 1 : 0;
    });
    return { rows, journal: Object.entries(flags).map(([date, v]) => ({ date, ...v })) };
  }

  // ---------- UI ----------
  const css = `
  .rr-sheet{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .rr-sheet[hidden]{display:none}
  .rr-panel{width:100%;max-width:560px;max-height:88vh;overflow:auto;background:rgba(28,28,32,.96);border:1px solid var(--hair);border-radius:24px 24px 0 0;padding:18px 16px calc(24px + env(safe-area-inset-bottom,0px));color:var(--ink);box-shadow:0 -12px 40px rgba(0,0,0,.5)}
  .rr-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .rr-top h2{font-size:22px;margin:0;font-weight:700}
  .rr-x{appearance:none;border:1px solid var(--hair);background:var(--glass2);color:var(--ink);border-radius:999px;padding:8px 14px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer}
  .rr-sec{border-top:1px solid var(--hair);padding:14px 0}
  .rr-sec h3{font-size:16px;margin:0 0 4px;font-weight:600}
  .rr-sec p{font-size:13px;line-height:1.4;color:var(--ink2);margin:0 0 10px}
  .rr-btn{appearance:none;border:0;border-radius:14px;background:var(--blue);color:#fff;font:600 15px -apple-system,system-ui,sans-serif;padding:12px 16px;cursor:pointer;min-height:44px}
  .rr-btn.ghost{background:var(--glass2);border:1px solid var(--hair);color:var(--ink)}
  .rr-st{font-size:13px;margin-top:8px;min-height:1.2em;color:var(--ink)}
  .rr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}
  .rr-grid label{display:grid;gap:4px;font-size:12px;color:var(--ink2);font-weight:600}
  .rr-grid input{width:100%;min-width:0;box-sizing:border-box;padding:10px;border-radius:12px;border:1px solid var(--hair);background:rgba(255,255,255,.08);color:var(--ink);font:600 16px/1 -apple-system,system-ui,sans-serif}
  .rr-tg{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .rr-tg label{display:flex;align-items:center;gap:6px;font-size:13px;padding:8px 12px;border-radius:999px;border:1px solid var(--hair);background:var(--glass)}
  .rr-tg input{width:18px;height:18px;accent-color:var(--blue)}
  .rr-foot{font-size:12px;color:var(--ink2);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .rr-link{appearance:none;background:none;border:0;color:var(--pink);font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer;padding:6px 0}
  .rr-btn:focus-visible,.rr-x:focus-visible,.rr-link:focus-visible{outline:2px solid #fff;outline-offset:2px}`;

  function build() {
    const root = document.querySelector('#dash-root .jx') || document.body;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const refresh = $('btn-refresh');
    if (refresh && !$('btn-load')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ub'; b.id = 'btn-load';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><span id="btn-load-l"></span>';
      refresh.parentNode.insertBefore(b, refresh.nextSibling);
      b.addEventListener('click', open);
    }
    const sh = document.createElement('div'); sh.className = 'rr-sheet'; sh.id = 'rr-sheet'; sh.hidden = true;
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'rr-title');
    sh.innerHTML = `<div class="rr-panel">
      <div class="rr-top"><h2 id="rr-title"></h2><button type="button" class="rr-x" id="rr-close"></button></div>
      <div class="rr-sec"><h3 id="rr-w-h"></h3><p id="rr-w-p"></p>
        <input type="file" id="rr-files" accept=".csv,text/csv" multiple hidden>
        <button type="button" class="rr-btn" id="rr-w-btn"></button><div class="rr-st" id="rr-w-st" role="status"></div><p id="rr-w-priv" style="margin-top:8px"></p></div>
      <div class="rr-sec"><h3 id="rr-d-h"></h3><p id="rr-d-p"></p>
        <div class="rr-grid">
          <label><span id="rr-l-rec"></span><input id="rr-rec" inputmode="numeric" autocomplete="off"></label>
          <label><span id="rr-l-hrv"></span><input id="rr-hrv" inputmode="numeric" autocomplete="off"></label>
          <label><span id="rr-l-rhr"></span><input id="rr-rhr" inputmode="numeric" autocomplete="off"></label>
          <label><span id="rr-l-sl"></span><input id="rr-sl" inputmode="decimal" placeholder="7:30" autocomplete="off"></label>
        </div>
        <div class="rr-tg">
          <label><input type="checkbox" id="rr-alc"><span id="rr-l-alc"></span></label>
          <label><input type="checkbox" id="rr-sug"><span id="rr-l-sug"></span></label>
          <label><input type="checkbox" id="rr-late"><span id="rr-l-late"></span></label>
        </div>
        <button type="button" class="rr-btn" id="rr-d-btn"></button><div class="rr-st" id="rr-d-st" role="status"></div></div>
      <div class="rr-sec"><h3 id="rr-f-h"></h3><p id="rr-f-p"></p></div>
      <div class="rr-sec rr-foot"><span id="rr-local"></span><button type="button" class="rr-link" id="rr-clear"></button></div>
    </div>`;
    root.appendChild(sh);
    sh.addEventListener('click', (e) => { if (e.target === sh) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.hidden) close(); });
    $('rr-close').addEventListener('click', close);
    $('rr-w-btn').addEventListener('click', () => $('rr-files').click());
    $('rr-files').addEventListener('change', onFiles);
    $('rr-d-btn').addEventListener('click', onToday);
    $('rr-clear').addEventListener('click', () => { window.rrLocal.clear(); $('rr-d-st').textContent = t('cleared'); });
    labels();
    const sw = document.getElementById('lang-sw'); if (sw) sw.addEventListener('click', () => setTimeout(labels, 0));
  }
  function labels() {
    const set = (id, k) => { const e = $(id); if (e) e.textContent = t(k); };
    set('btn-load-l', 'btn'); set('rr-title', 'title'); set('rr-close', 'close'); set('rr-w-h', 'w_h'); set('rr-w-p', 'w_p'); set('rr-w-btn', 'w_btn'); set('rr-w-priv', 'w_priv');
    set('rr-d-h', 'd_h'); set('rr-d-p', 'd_p'); set('rr-l-rec', 'rec'); set('rr-l-hrv', 'hrv'); set('rr-l-rhr', 'rhr'); set('rr-l-sl', 'sl');
    set('rr-l-alc', 'alc'); set('rr-l-sug', 'sug'); set('rr-l-late', 'late'); set('rr-d-btn', 'd_btn'); set('rr-f-h', 'f_h'); set('rr-f-p', 'f_p'); set('rr-local', 'local'); set('rr-clear', 'clear');
  }
  let lastFocus = null;
  function open() { labels(); lastFocus = document.activeElement; $('rr-sheet').hidden = false; $('rr-close').focus(); }
  function close() { $('rr-sheet').hidden = true; if (lastFocus) lastFocus.focus(); }

  async function onFiles(e) {
    const files = [...e.target.files]; e.target.value = '';
    const st = $('rr-w-st'); st.textContent = '…';
    const parsed = await Promise.all(files.map(async (f) => parseCSV(await f.text())));
    const cycles = parsed.find((rows) => rows[0] && 'Recovery score %' in rows[0]);
    const journal = parsed.find((rows) => rows[0] && 'Question text' in rows[0]);
    if (!cycles) { st.textContent = t('w_need'); return; }
    const res = importWhoop(cycles, journal);
    if (!res.rows.length) { st.textContent = t('w_need'); return; }
    const ok = window.rrLocal.saveWhoop(res.rows, res.journal);
    const dates = res.rows.map((r) => r.date).sort();
    st.textContent = ok ? T[lang()].w_ok(res.rows.length, dates[0], dates[dates.length - 1], res.journal.length) : t('store_full');
  }
  function onToday() {
    const st = $('rr-d-st');
    const rec = num($('rr-rec').value);
    if (rec == null || rec < 0 || rec > 100) { st.textContent = t('d_bad'); return; }
    const sl = $('rr-sl').value.trim();
    let hours = null;
    if (/^\d{1,2}:\d{1,2}$/.test(sl)) { const [h, m] = sl.split(':').map(Number); hours = Math.round((h + m / 60) * 100) / 100; }
    else if (sl) hours = num(sl.replace(',', '.'));
    const date = todayIso();
    const row = { date, recovery: rec, hrv: num($('rr-hrv').value), rhr: num($('rr-rhr').value), asleep_h: hours, source: 'manual' };
    const flags = { date, alcohol: $('rr-alc').checked ? 1 : 0, sugar: $('rr-sug').checked ? 1 : 0, late_meal: $('rr-late').checked ? 1 : 0 };
    const ok = window.rrLocal.saveWhoop([row], [flags]);
    st.textContent = ok ? t('d_ok') : t('store_full');
  }
  window.rrImport = { parseCSV, importWhoop };   // exposed for testing

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
