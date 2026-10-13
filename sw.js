// Caches the app shell so the app opens instantly and offline.
// Audio streams straight from put.io. Downloaded books live in their own cache, managed by offline.js.
const PREFIX = 'putio-audiobooks-shell-';
const CACHE = PREFIX + 'v13';
const SHELL = [
  './', 'index.html', 'styles.css', 'boot.js', 'app.js', 'api.js', 'm4b.js', 'config.js', 'covers.js', 'demo.js', 'offline.js', 'scan.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', 'icons/connect-art.svg', 'icons/chill.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // The demo's audio is too big for the shell cache; offline.js saves it when a book is downloaded.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/demo/')) return;
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
