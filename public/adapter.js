// Ride Ready: data layer for the standalone web app.
// Replaces the Claude dashboard runtime (window.dash) with files served from /data,
// plus anything the rider loaded on this phone (Whoop export, daily entries), kept in local storage.
// Later the files in /data are replaced by the rider's own data from the server.
(function () {
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
    if ((loc.whoop && loc.whoop.length) || (loc.journal && loc.journal.length)) {
      const whoop = addAverages(mergeByDate(raw.whoop, loc.whoop));
      const journal = mergeByDate(raw.journal_flags, loc.journal);
      out.whoop = whoop;
      out.journal_flags = journal;
      const fx = whoopFx(whoop, journal, raw.pmc);
      if (fx.length) out.whoop_fx = fx;
    }
    view = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, flat(v)]));
  }

  async function loadAll() {
    const ids = await fetch('data/index.json', { cache: 'no-cache' }).then((r) => r.json());
    await Promise.all(ids.map(async (id) => {
      try { const j = await fetch('data/' + id + '.json', { cache: 'no-cache' }).then((r) => r.json()); raw[id] = Array.isArray(j) ? j : j.rows || []; } catch (e) { delete raw[id]; }
    }));
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
