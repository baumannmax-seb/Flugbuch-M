// Einfacher Service Worker: App-Shell offline verfügbar, Kartenkacheln werden beim Ansehen gecacht.
const APP_CACHE = 'flugbuch-app-v4';
const TILE_CACHE = 'flugbuch-tiles-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(['./', './index.html', './airfields.json', './airfield-details.json', './manifest.webmanifest', './icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isTile = /tile/.test(url.hostname) || /\/\d+\/\d+\/\d+\.png/.test(url.pathname);
  if (isTile) {
    // Cache first für Kacheln (Offline-Nutzung bereits gesehener Bereiche)
    e.respondWith(
      caches.open(TILE_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  if (url.origin === self.location.origin) {
    // Network first, Fallback Cache
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
  }
});
