// Caches the app shell so the app opens instantly and offline.
// Audio streams straight from put.io. Downloaded books live in their own cache, managed by offline.js.
const PREFIX = 'putio-audiobooks-shell-';
const CACHE = PREFIX + 'v17';
// vendor/ has its own cache, named for the library's version, so app updates don't download it again.
const VENDOR = 'putio-audiobooks-vendor-3.8.1';
// Cover art from other sites, kept across app updates.
const COVERS = 'putio-audiobooks-covers';
const SHELL = [
  './', 'index.html', 'styles.css', 'boot.js', 'app.js', 'api.js', 'm4b.js', 'config.js', 'covers.js', 'demo.js', 'offline.js', 'scan.js', 'i18n.js',
  'clip.js', 'epub.js', 'sync.js', 'whisper.js', 'whisper-worker.js', 'zip.js',
  'locales/de.js', 'locales/es.js', 'locales/fr.js', 'locales/it.js', 'locales/nl.js', 'locales/pt.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', 'icons/connect-art.svg', 'icons/chill.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || (k.startsWith('putio-audiobooks-vendor-') && k !== VENDOR)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Covers come from put.io, Apple and Open Library. Keep each one shown, so the art is still there offline.
  // ponytail: never trimmed, so old picker thumbs pile up; prune it if the cache gets big.
  if (req.method === 'GET' && req.destination === 'image' && url.origin !== self.location.origin) {
    e.respondWith(caches.open(COVERS).then(async (cache) => (await cache.match(req.url)) ||
      fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
        .catch(() => fetch(req)) // a host without CORS still gives an image <img> can show
        .then((res) => { if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone()); return res; })));
    return;
  }
  // The demo's audio is too big for the shell cache; offline.js saves it when a book is downloaded.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/demo/')) return;
  // The speech library is large and only changes with its version: cache it on first use, never refresh it.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(VENDOR).then(async (cache) => (await cache.match(req)) || fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })));
    return;
  }
  // Stale-while-revalidate: answer from cache, refresh in the background.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      const fresh = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
      return hit || fresh;
    })
  );
});
