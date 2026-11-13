// Caches the app shell so the app opens instantly and offline.
// Audio streams straight from put.io. Downloaded books live in their own cache, managed by offline.js.
const PREFIX = 'putio-audiobooks-shell-';
const CACHE = PREFIX + 'v26';
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

// A large downloaded track is saved in parts (offline.js), behind a marker with an X-Parts header. Only the
// parts a range touches are read: Safari loads a whole cached body into memory on match, so joining every part
// of an 800 MB track for each request the player makes runs it out of memory ("Internal error").
const MAX_PARTS = 2; // per response; the player asks again for the rest
async function fromParts(res, range, url) {
  const n = +res.headers.get('X-Parts');
  const type = res.headers.get('Content-Type') || '';
  const part = async (i) => { const r = await caches.match(`${url}/part-${i}`); return r && r.blob(); };
  // Markers from before X-Size and X-Part were written: measure the first and last parts.
  let step = +res.headers.get('X-Part'), size = +res.headers.get('X-Size');
  if (!step || !size) {
    const first = await part(0), last = n > 1 ? await part(n - 1) : first;
    if (!first || !last) return null;
    step = first.size;
    size = (n - 1) * step + last.size;
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m || (!m[1] && !m[2])) {
    // No range: the whole file. Players always send one, so this is rare.
    const all = [];
    for (let i = 0; i < n; i++) { const b = await part(i); if (!b) return null; all.push(b); }
    return new Response(new Blob(all, { type }), { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const first = Math.floor(start / step);
  const cap = Math.min(size, (first + MAX_PARTS) * step) - 1;
  const end = Math.min(m[1] && m[2] ? +m[2] : size - 1, size - 1, cap);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const blobs = [];
  for (let i = first; i <= Math.floor(end / step); i++) { const b = await part(i); if (!b) return null; blobs.push(b); }
  const body = new Blob(blobs).slice(start - first * step, end - first * step + 1, type);
  return new Response(body, { status: 206, headers: {
    'Content-Type': type, 'Content-Length': String(end - start + 1),
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes',
  } });
}

// The part of a cached response a Range header asks for. Slicing the blob reads only that part.
async function ranged(res, range, url) {
  if (res.headers.get('X-Parts')) return (await fromParts(res, range, url)) || new Response(null, { status: 404 });
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

// Keeps the newest 300 covers; keys() lists them oldest first.
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - 300)).map((k) => cache.delete(k)));
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
  if (req.method === 'GET' && req.destination === 'image' && url.origin !== self.location.origin) {
    // put.io sends no CORS headers, so asking for CORS there only fails and logs an error.
    const get = () => url.hostname.endsWith('put.io') ? fetch(req)
      : fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => fetch(req));
    e.respondWith(caches.open(COVERS).then(async (cache) => (await cache.match(req.url)) || get()
        .then((res) => { if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone()).then(() => trim(cache)); return res; })));
    return;
  }
  // Downloaded books (offline.js), a range at a time, the way the player asks for them. A blob URL would hold
  // the whole file in memory, which a long M4B on an iPhone may not survive.
  if (req.method === 'GET' && url.origin === self.location.origin && url.pathname.includes('/offline/')) {
    e.respondWith(caches.match(url.href).then((res) => (res ? ranged(res, req.headers.get('range'), url.href) : fetch(req))));
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
