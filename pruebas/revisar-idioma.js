// Busca textos en ingles que se escapen cuando la app esta en español.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = '/Users/juanhernandez/Library/CloudStorage/OneDrive-Personal/App/RIDE READY APP/ride-ready-web/public';

const data = {};
JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'))).forEach((id) => {
  data[id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', id + '.json')));
});
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
const flat = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
const view = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, flat(Array.isArray(v) ? v : [])]));
window.eval(`window.__view = ${JSON.stringify(view)};
  window.localStorage.setItem('rr_lang','es');
  window.dash = { data: (id) => (window.__view[id] && window.__view[id].length ? { status:'ok', data: window.__view[id] } : { status:'missing', data: [] }),
    onData: (f) => { window.__cb = f; }, params: () => ({lang:'es'}), setParams: () => {}, refresh: () => {}, loader: () => {}, setLink: () => {}, colors: [] };
  window.rrLocal = { get: () => ({}), saveWhoop: () => true, saveActivity: () => true, clear: () => {} };
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({data:[]}), maybeSingle: async () => ({data:null}) }) }), upsert: async () => ({}) }),
    functions: { invoke: async () => ({data:{},error:null}) } }) };`);
['vendor/d3.min.js', 'importer.js', 'account.js'].forEach((f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/div>/) || html.match(/<script>([\s\S]*)<\/script>/);
window.eval(m[1]);
window.__cb && window.__cb();

const doc = window.document;
const pages = { today: 'tab-today', trends: 'tab-trends', history: 'tab-history', model: 'tab-model' };

// Palabras inglesas comunes que no deberian aparecer en modo español.
const EN = /\b(today|rest|ride|training|days?|week|recovery|sleep|fitness|fatigue|form|load|power|your|the|and|with|from|under|over|this|that|best|last|next|good|easy|hard|full|plan|session|spin|walk|stretch|follow|workout|below|planned|zone|than|about|since)\b/i;
const skip = /^(\d|[+\-·%.,:/()–—]|W|km|kg|h|min|ms|lpm|bpm|Z\d|AM|PM|HIIT|MTB|FTP|VFC|Whoop|Garmin|Strava|Karoo|intervals\.icu|Ride Ready|ES|EN|RR)/;

const found = [];
Object.entries(pages).forEach(([name, id]) => {
  doc.getElementById(id).click();
  const root = doc.querySelector('#dash-root .jx');
  const w = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t || t.length < 4 || skip.test(t)) continue;
    if (EN.test(t)) found.push(`[${name}] ${t.slice(0, 110)}`);
  }
});

const uniq = [...new Set(found)];
console.log(`Textos en ingles encontrados en modo español: ${uniq.length}`);
uniq.slice(0, 60).forEach((t) => console.log('  ', t));
