// Ride Ready: data layer for the standalone web app.
// Replaces the Claude dashboard runtime (window.dash) with files served from /data,
// plus anything the rider loaded on this phone (Whoop export, daily entries), kept in local storage.
// Later the files in /data are replaced by the rider's own data from the server.
(function () {
  const SUPABASE_URL = 'https://dbyewzuvpknamkpcaqcc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6nWi9MryrXpuCBvv7QMPOQ_mkYS97sk';
  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const KEY = 'rr_params', LOCAL = 'rr_local';
  let params = { lang: 'es' };
  try { Object.assign(params, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const raw = {};           // rows exactly as served
  let view = {};            // rows the panel sees (served + local), flattened
  let ready = false, cb = null;

  // The panel expects nested values as JSON strings (as the dashboard runtime delivered them).
  const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));

  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}'); } catch (e) { return {}; } }
  function writeLocal(o) { try { localStorage.setItem(LOCAL, JSON.stringify(o)); return true; } catch (e) { return false; } }

  // Trailing 7- and 30-day averages, including the row's own day.
  function addAverages(rows) {
    const t = (d) => Date.parse(d + 'T00:00:00Z') / 864e5;
    rows.forEach((r) => {
      const day = t(r.date);
      [['hrv', 7], ['hrv', 30], ['rhr', 7], ['rhr', 30]].forEach(([k, n]) => {
        const v = rows.filter((x) => x[k] != null && t(x.date) <= day && t(x.date) > day - n).map((x) => x[k]);
        r[k + '_' + n + 'd'] = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
      });
    });
    return rows;
  }
  function mergeByDate(base, extra) {
    const m = new Map((base || []).map((r) => [r.date, { ...r }]));
    (extra || []).forEach((r) => m.set(r.date, { ...(m.get(r.date) || {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) }));
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  // What moves recovery: next-morning recovery with and without each factor (same method as whoop_import.py).
  function whoopFx(whoop, flags, pmc) {
    const loads = new Map((pmc || []).filter((r) => !(r.projected === true || r.projected === 'true')).map((r) => [r.date, +r.load]));
    const fl = new Map((flags || []).map((r) => [r.date, r]));
    const prev = (d) => new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
    const mean = (L, k) => { const v = L.map((x) => x[k]).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
    const f = (factor, label, compare, yes, no) => {
      const Y = whoop.filter(yes), N = whoop.filter(no);
      if (Y.length < 5 || N.length < 5) return null;
      return { factor, label, compare, rec_delta: Math.round((mean(Y, 'recovery') - mean(N, 'recovery')) * 10) / 10, hrv_delta: Math.round((mean(Y, 'hrv') - mean(N, 'hrv')) * 10) / 10, n: Y.length };
    };
    const ld = (r) => (loads.has(prev(r.date)) ? loads.get(prev(r.date)) : -1);
    const q = (r, k) => (fl.get(r.date) || {})[k];
    return [
      loads.size ? f('big_day', 'Day after a big Strava day (relative effort 150+)', 'vs days under 50', (r) => ld(r) >= 150, (r) => ld(r) >= 0 && ld(r) < 50) : null,
      f('short_sleep', 'Slept under 6 hours', 'vs 7+ hours', (r) => (r.asleep_h ?? 99) < 6, (r) => (r.asleep_h ?? 0) >= 7),
      f('alcohol', 'Had alcohol the day before', 'vs no alcohol', (r) => q(r, 'alcohol') === 1, (r) => q(r, 'alcohol') === 0),
      f('sugar', 'Added sugar the day before', 'vs none', (r) => q(r, 'sugar') === 1, (r) => q(r, 'sugar') === 0),
      f('late_meal', 'Ate close to bedtime', 'vs not', (r) => q(r, 'late_meal') === 1, (r) => q(r, 'late_meal') === 0)
    ].filter(Boolean);
  }

  function rebuild() {
    const loc = readLocal();
    const out = { ...raw };
    if ((raw.whoop && raw.whoop.length) || (loc.whoop && loc.whoop.length) || (loc.journal && loc.journal.length)) {
      const whoop = addAverages(mergeByDate(raw.whoop, loc.whoop));
      const journal = mergeByDate(raw.journal_flags, loc.journal);
      out.whoop = whoop;
      out.journal_flags = journal;
      const fx = whoopFx(whoop, journal, raw.pmc);
      if (fx.length) out.whoop_fx = fx;
    }
    view = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, flat(v)]));
  }

  // Carga diaria = esfuerzo relativo; forma fisica = promedio exponencial de 42 dias;
  // fatiga = 7 dias; frescura = forma fisica de ayer menos fatiga de ayer;
  // relacion de carga = suma de 7 dias / (suma de 28 dias / 4). Misma formula que las notas del proyecto.
  function computePmc(activities) {
    const byDate = new Map();
    (activities || []).forEach((a) => { if (a.date) byDate.set(a.date, (byDate.get(a.date) || 0) + (+a.relative_effort || 0)); });
    if (!byDate.size) return [];
    const dates = [...byDate.keys()].sort();
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const lastIso = dates[dates.length - 1] > todayIso ? dates[dates.length - 1] : todayIso;
    const days = []; let d = new Date(dates[0] + 'T00:00:00Z'); const end = new Date(lastIso + 'T00:00:00Z');
    for (; d <= end; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
    const loads = days.map((x) => byDate.get(x) || 0);
    let fitness = 0, fatigue = 0; const af = 2 / 43, al = 2 / 8; const rows = [];
    days.forEach((date, i) => {
      const load = loads[i]; fitness += af * (load - fitness); fatigue += al * (load - fatigue);
      const form = rows.length ? rows[rows.length - 1].fitness - rows[rows.length - 1].fatigue : 0;
      const w7 = loads.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0);
      const w28 = loads.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b, 0);
      rows.push({ date, load, fitness: Math.round(fitness * 10) / 10, fatigue: Math.round(fatigue * 10) / 10, form: Math.round(form * 10) / 10, acwr: w28 ? Math.round((w7 / (w28 / 4)) * 100) / 100 : 0, projected: date > todayIso });
    });
    return rows;
  }

  // Trae lo que ya sincronizamos de intervals.icu (Garmin, Karoo, Whoop) para quien inicio sesion.
  async function loadFromAccount() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return;
    const uid = data.session.user.id;
    const [a, w] = await Promise.all([
      sb.from('activities').select('*').eq('user_id', uid).order('date', { ascending: true }),
      sb.from('wellness').select('*').eq('user_id', uid).order('date', { ascending: true }),
    ]);
    if (a.data && a.data.length) {
      raw.activities = a.data.map((x) => ({ date: x.date, name: x.name, sport: x.sport, moving_min: x.moving_min, distance_km: x.distance_km, relative_effort: x.relative_effort, calories: x.calories, avg_hr: x.avg_hr, max_hr: x.max_hr, avg_watts: x.avg_watts }));
      raw.pmc = computePmc(raw.activities);
    }
    if (w.data && w.data.length) {
      raw.whoop = w.data.map((x) => ({ date: x.date, recovery: x.readiness, hrv: x.hrv, rhr: x.resting_hr, asleep_h: x.sleep_min != null ? Math.round((x.sleep_min / 60) * 100) / 100 : null, need_h: null, sleep_perf: null, debt_min: null, resp: null, deep_min: null, rem_min: null, source: 'intervals.icu' }));
    }
  }

  async function loadAll() {
    const ids = await fetch('data/index.json', { cache: 'no-cache' }).then((r) => r.json());
    await Promise.all(ids.map(async (id) => {
      try { const j = await fetch('data/' + id + '.json', { cache: 'no-cache' }).then((r) => r.json()); raw[id] = Array.isArray(j) ? j : j.rows || []; } catch (e) { delete raw[id]; }
    }));
    try { await loadFromAccount(); } catch (e) { console.error('No se pudo traer la cuenta', e); }
    rebuild();
    ready = true;
  }
  const fire = () => { if (cb) setTimeout(cb, 0); };

  window.dash = {
    data: (id) => (view[id] ? { status: 'ok', data: view[id] } : { status: 'missing', data: [] }),
    onData: (f) => { cb = f; if (ready) fire(); },
    params: () => params,
    setParams: (o) => { Object.assign(params, o); try { localStorage.setItem(KEY, JSON.stringify(params)); } catch (e) {} fire(); },
    refresh: () => { loadAll().then(fire); },
    loader: () => {},
    setLink: () => {},
    colors: []
  };
  // Used by importer.js: save what the rider loaded on this phone and redraw.
  window.rrLocal = {
    get: readLocal,
    saveWhoop(rows, journal) {
      const loc = readLocal();
      loc.whoop = mergeByDate(loc.whoop, rows);
      loc.journal = mergeByDate(loc.journal, journal);
      const ok = writeLocal(loc); rebuild(); fire(); return ok;
    },
    clear() { try { localStorage.removeItem(LOCAL); } catch (e) {} rebuild(); fire(); }
  };

  loadAll().then(fire).catch((e) => console.error('No se pudieron cargar los datos', e));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
