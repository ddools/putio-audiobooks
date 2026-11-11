// Books saved on this device, for listening without a connection.
// Each track is one entry in its own Cache, keyed by its put.io file id. A large track is fetched in parts
// (offline/<id>/part-<n>), so a dropped connection costs one part, not the whole file; its entry is then an
// empty marker with an X-Parts header, written last, once every part is in.
// shortcut: downloads only run while the app is open, move to Background Fetch if people need to leave mid-download.
import { DEMO } from './config.js';

// The demo keeps its own cache: its library must never count as the real one when stale downloads are dropped.
const CACHE = DEMO ? 'putio-audiobooks-demo-audio' : 'putio-audiobooks-audio';
const key = (id) => `offline/${id}`;
const partKey = (id, n) => `offline/${id}/part-${n}`;
// Big enough to keep requests few, small enough that a retry costs little.
export const PART = 16 * 1024 * 1024;
const TRIES = 4;
// Safari picks a decoder from the type, and put.io serves some audio as octet-stream.
const TYPES = { mp3: 'audio/mpeg', m4b: 'audio/mp4', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };
export const typeOf = (name) => TYPES[name.split('.').pop().toLowerCase()];

const saved = new Set();
const urls = new Map();
const open = () => caches.open(CACHE);

export const supported = 'caches' in globalThis;
export const has = (id) => saved.has(String(id));
export const hasBook = (book) => book.tracks.every((t) => has(t.id));

export async function init() {
  if (!supported) return;
  for (const req of await (await open()).keys()) {
    const m = /\/offline\/([^/]+)$/.exec(req.url);
    if (m) saved.add(m[1]);
  }
}

// A saved entry's whole file. Parts are joined lazily: the Blob only points at them on disk.
async function whole(cache, id, res) {
  const n = +res.headers.get('X-Parts');
  if (!n) return res.blob();
  const parts = [];
  for (let i = 0; i < n; i++) {
    const part = await cache.match(partKey(id, i));
    if (!part) return null;
    parts.push(await part.blob());
  }
  return new Blob(parts, { type: res.headers.get('Content-Type') || '' });
}

const wait = (ms, signal) => new Promise((ok, fail) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); fail(signal.reason); }, { once: true });
});

// One part of a track, retried with a fresh put.io URL: a link can expire during a long download.
async function fetchPart(id, n, size, getUrl, signal, onBytes) {
  const start = n * PART, end = Math.min(size, start + PART) - 1;
  for (let attempt = 1; ; attempt++) {
    let got = 0;
    try {
      const res = await fetch(await getUrl(id), { signal, headers: { Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) throw Object.assign(new Error(`put.io returned ${res.status}`), { fatal: res.status !== 200 && res.status < 500 });
      const buf = new Uint8Array(end - start + 1);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (got + value.byteLength > buf.length) throw new Error('put.io sent more than was asked for');
        buf.set(value, got);
        got += value.byteLength;
        onBytes(value.byteLength);
      }
      if (got !== buf.length) throw new Error('put.io sent less than was asked for');
      return buf;
    } catch (err) {
      onBytes(-got);
      if (signal?.aborted || err.fatal || err.name === 'QuotaExceededError' || attempt >= TRIES) throw err;
      await wait(1000 * 2 ** attempt, signal);
    }
  }
}

// Fetches the tracks that are missing, so a failed download picks up where it stopped.
export async function download(book, getUrl, onProgress, signal) {
  navigator.storage?.persist?.().catch(() => {});
  const cache = await open();
  const total = book.tracks.reduce((n, t) => n + t.size, 0) || 1;
  let got = 0;
  for (const t of book.tracks) {
    if (has(t.id)) { got += t.size; continue; }
    const type = typeOf(t.name) || 'audio/mpeg';
    if (t.size > PART) {
      const n = Math.ceil(t.size / PART);
      for (let i = 0; i < n; i++) {
        // Parts already saved by an earlier, stopped attempt are kept.
        if (await cache.match(partKey(t.id, i))) { got += Math.min(PART, t.size - i * PART); onProgress(Math.min(1, got / total)); continue; }
        const buf = await fetchPart(t.id, i, t.size, getUrl, signal, (b) => { got += b; onProgress(Math.min(1, got / total)); });
        await cache.put(partKey(t.id, i), new Response(buf, { headers: { 'Content-Type': type } }));
      }
      await cache.put(key(t.id), new Response(null, { headers: { 'Content-Type': type, 'X-Parts': String(n) } }));
      saved.add(String(t.id));
      continue;
    }
    const res = await fetch(await getUrl(t.id), { signal });
    if (!res.ok) throw new Error(`put.io returned ${res.status}`);
    const before = got;
    const count = new TransformStream({
      transform(chunk, ctl) { got += chunk.byteLength; onProgress(Math.min(1, got / total)); ctl.enqueue(chunk); },
    });
    const kind = typeOf(t.name) || res.headers.get('Content-Type') || type;
    // The entry only lands once the whole body has arrived, so a dropped connection leaves nothing half-saved.
    try { await cache.put(key(t.id), new Response(res.body.pipeThrough(count), { headers: { 'Content-Type': kind } })); }
    catch (err) { got = before; throw err; }
    saved.add(String(t.id));
  }
}

async function drop(cache, id) {
  await cache.delete(key(id));
  for (const req of await cache.keys()) if (req.url.includes(`/offline/${id}/part-`)) await cache.delete(req);
  saved.delete(id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}
export async function remove(book) {
  const cache = await open();
  for (const t of book.tracks) await drop(cache, String(t.id));
}
// Drops saved tracks whose books are gone from the library.
export async function keepOnly(ids) {
  const cache = await open();
  // Parts of a stopped download count too, or they would sit on the device for good.
  const partial = (await cache.keys()).map((r) => /\/offline\/([^/]+)\/part-/.exec(r.url)?.[1]).filter(Boolean);
  const stale = [...new Set([...saved, ...partial])].filter((id) => !ids.has(id));
  if (!stale.length) return;
  for (const id of stale) await drop(cache, id);
}

// A local URL for a saved track, or null if the browser has evicted it.
export async function localUrl(id) {
  id = String(id);
  if (!urls.has(id)) {
    const cache = await open();
    const res = await cache.match(key(id));
    const file = res && !globalThis.navigator?.serviceWorker?.controller && await whole(cache, id, res);
    if (!res || file === null) { saved.delete(id); return null; }
    // sw.js serves the file from the cache a range at a time. Without it (localhost, first visit), a blob URL.
    urls.set(id, file ? URL.createObjectURL(file) : new URL(key(id), location.href).href);
  }
  return urls.get(id);
}

// A saved file's bytes, or null. Used to cut speech clips from downloaded tracks, and to reopen EPUBs.
export async function blob(id) {
  if (!supported) return null;
  const cache = await open();
  const res = await cache.match(key(id));
  const file = res && await whole(cache, String(id), res);
  if (!file) { saved.delete(String(id)); return null; }
  return file;
}
// Keeps a small file, like an EPUB, so the book opens again without put.io.
export async function save(id, data, type) {
  if (!supported) return;
  await (await open()).put(key(id), new Response(data, { headers: { 'Content-Type': type } }));
  saved.add(String(id));
}
