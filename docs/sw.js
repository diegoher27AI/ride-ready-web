// Ride Ready service worker: la app abre sin conexion con lo ultimo guardado,
// pero SIEMPRE intenta primero lo que hay en el servidor.
//
// Antes esto era al reves (primero lo guardado) y por eso cada cambio exigia cerrar
// la app por completo para verlo, y el icono viejo se quedaba pegado. Ahora, con
// conexion siempre ves lo ultimo; sin conexion ves lo que quedo guardado.
const CACHE = 'rr-shell-v13';
const SHELL = ['./', 'index.html', 'adapter.js', 'importer.js', 'account.js', 'vendor/d3.min.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/apple-touch-icon-v2.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Red primero, y lo guardado solo como respaldo cuando no hay conexion.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
  );
});
