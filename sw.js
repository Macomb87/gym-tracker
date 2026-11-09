// App files: network first (so updates arrive), cache as offline fallback.
// Exercise photos: cache first (they never change).
const CACHE = 'gym-tracker-v1';
const SHELL = ['./', 'index.html', 'app.js', 'exercises.js', 'chart.umd.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const put = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; };
  if (e.request.url.includes('free-exercise-db')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
  } else if (new URL(e.request.url).origin === location.origin) {
    // no-cache: always ask the server, so a new version isn't hidden by GitHub Pages' 10-minute browser cache
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(put).catch(() => caches.match(e.request)));
  }
});
