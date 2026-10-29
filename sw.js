// Caches the app shell so the app opens instantly and offline.
// Audio streams straight from put.io. Downloaded books live in their own cache, managed by offline.js.
const PREFIX = 'putio-audiobooks-shell-';
const CACHE = PREFIX + 'v20';
// vendor/ has its own cache, named for the library's version, so app updates don't download it again.
const VENDOR = 'putio-audiobooks-vendor-3.8.1';
// Cover art from other sites, kept across app updates.
const COVERS = 'putio-audiobooks-covers';
const SHELL = [
  './', 'index.html', 'styles.css', 'boot.js', 'app.js', 'api.js', 'm4b.js', 'config.js', 'covers.js', 'demo.js', 'merge.js', 'offline.js', 'scan.js', 'i18n.js',
  'clip.js', 'epub.js', 'sync.js', 'whisper.js', 'whisper-worker.js', 'zip.js',
  'locales/de.js', 'locales/es.js', 'locales/fr.js', 'locales/it.js', 'locales/nl.js', 'locales/pt.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', 'icons/connect-art.svg',
];

// The part of a cached response a Range header asks for. Slicing the blob reads only that part.
async function ranged(res, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m || (!m[1] && !m[2])) return res;
  const blob = await res.blob();
  const size = blob.size;
  const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
  const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type'), 'Content-Length': String(end - start + 1),
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes',
  } });
}

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
    // put.io sends no CORS headers, so asking for CORS there only fails and logs an error.
    const get = () => url.hostname.endsWith('put.io') ? fetch(req)
      : fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => fetch(req));
    e.respondWith(caches.open(COVERS).then(async (cache) => (await cache.match(req.url)) || get()
        .then((res) => { if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone()); return res; })));
    return;
  }
  // Downloaded books (offline.js), a range at a time, the way the player asks for them. A blob URL would hold
  // the whole file in memory, which a long M4B on an iPhone may not survive.
  if (req.method === 'GET' && url.origin === self.location.origin && url.pathname.includes('/offline/')) {
    e.respondWith(caches.match(url.href).then((res) => (res ? ranged(res, req.headers.get('range')) : fetch(req))));
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
