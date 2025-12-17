/* LabelSpy — service worker (static offline cache)
   Note: Caches only same-origin assets. CDN libs are not cached here.

   Cache versioning:
   Bump the CACHE name whenever core assets (like app.js or index.html) change.
   This forces browsers to install a new service worker and fetch updated files
   instead of serving stale cached versions from previous deployments.
*/
const CACHE = 'labelspy-glass-v2';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/e_additives_ru.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => (k === CACHE ? Promise.resolve() : caches.delete(k)))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  // Navigation: serve cached shell, then update
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) =>
        cached || fetch(req).catch(() => cached)
      )
    );
    return;
  }

  // Asset: cache-first, then update in background
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetcher = fetch(req).then((res) => {
        if (res && res.status === 200 && req.method === 'GET') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);

      return cached || fetcher;
    })
  );
});
