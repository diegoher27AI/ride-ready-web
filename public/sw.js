// Ride Ready service worker: la app abre sin conexion con lo ultimo guardado,
// pero SIEMPRE intenta primero lo que hay en el servidor.
//
// Antes esto era al reves (primero lo guardado) y por eso cada cambio exigia cerrar
// la app por completo para verlo, y el icono viejo se quedaba pegado. Ahora, con
// conexion siempre ves lo ultimo; sin conexion ves lo que quedo guardado.
const CACHE = 'rr-shell-v32';
const SHELL = ['./', 'index.html', 'adapter.js', 'importer.js', 'account.js', 'modelo.js', 'primeros-pasos.js', 'coach.js', 'vendor/d3.min.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/apple-touch-icon-v2.png'];

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

// ---------- avisos al telefono ----------
// El aviso llega con la decision ya calculada: aqui solo se muestra. No se calcula
// nada ni se llama a ningun servicio, asi que no cuesta nada y aparece al instante.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { cuerpo: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Ride Ready';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: 'icons/icon-192-v2.png',
    badge: 'icons/icon-192-v2.png',
    tag: d.tag || 'rr-dia',          // uno solo por dia: no se amontonan
    renotify: false,
    data: { url: d.url || './' },
  }));
});

// Al tocar el aviso se abre la app. Si ya esta abierta, se trae al frente en vez
// de abrir una ventana nueva.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) {
      if (c.url.includes(self.registration.scope) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(destino) : null;
  }));
});
