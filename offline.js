// Books saved on this device, for listening without a connection.
// Each track is one entry in its own Cache, keyed by its put.io file id.
// shortcut: downloads only run while the app is open, move to Background Fetch if people need to leave mid-download.
import { DEMO } from './config.js';

// The demo keeps its own cache: its library must never count as the real one when stale downloads are dropped.
const CACHE = DEMO ? 'putio-audiobooks-demo-audio' : 'putio-audiobooks-audio';
const key = (id) => `offline/${id}`;
// Safari picks a decoder from the type, and put.io serves some audio as octet-stream.
const TYPES = { mp3: 'audio/mpeg', m4b: 'audio/mp4', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };

const saved = new Set();
const urls = new Map();
const open = () => caches.open(CACHE);

export const supported = 'caches' in globalThis;
export const has = (id) => saved.has(String(id));
export const hasBook = (book) => book.tracks.every((t) => has(t.id));

export async function init() {
  if (!supported) return;
  for (const req of await (await open()).keys()) saved.add(req.url.split('/').pop());
}

// Fetches the tracks that are missing, so a failed download picks up where it stopped.
export async function download(book, getUrl, onProgress, signal) {
  navigator.storage?.persist?.().catch(() => {});
  const cache = await open();
  const total = book.tracks.reduce((n, t) => n + t.size, 0) || 1;
  let got = 0;
  for (const t of book.tracks) {
    if (has(t.id)) { got += t.size; continue; }
    const res = await fetch(await getUrl(t.id), { signal });
    if (!res.ok) throw new Error(`put.io returned ${res.status}`);
    const before = got;
    const count = new TransformStream({
      transform(chunk, ctl) { got += chunk.byteLength; onProgress(Math.min(1, got / total)); ctl.enqueue(chunk); },
    });
    const type = TYPES[t.name.split('.').pop().toLowerCase()] || res.headers.get('Content-Type') || 'audio/mpeg';
    // The entry only lands once the whole body has arrived, so a dropped connection leaves nothing half-saved.
    try { await cache.put(key(t.id), new Response(res.body.pipeThrough(count), { headers: { 'Content-Type': type } })); }
    catch (err) { got = before; throw err; }
    saved.add(String(t.id));
  }
}

async function drop(cache, id) {
  await cache.delete(key(id));
  saved.delete(id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}
export async function remove(book) {
  const cache = await open();
  for (const t of book.tracks) await drop(cache, String(t.id));
}
// Drops saved tracks whose books are gone from the library.
export async function keepOnly(ids) {
  const stale = [...saved].filter((id) => !ids.has(id));
  if (!stale.length) return;
  const cache = await open();
  for (const id of stale) await drop(cache, id);
}

// A local URL for a saved track, or null if the browser has evicted it.
export async function localUrl(id) {
  id = String(id);
  if (!urls.has(id)) {
    const res = await (await open()).match(key(id));
    if (!res) { saved.delete(id); return null; }
    urls.set(id, URL.createObjectURL(await res.blob()));
  }
  return urls.get(id);
}

// A saved file's bytes, or null. Used to cut speech clips from downloaded tracks, and to reopen EPUBs.
export async function blob(id) {
  if (!supported) return null;
  const res = await (await open()).match(key(id));
  if (!res) { saved.delete(String(id)); return null; }
  return res.blob();
}
// Keeps a small file, like an EPUB, so the book opens again without put.io.
export async function save(id, data, type) {
  if (!supported) return;
  await (await open()).put(key(id), new Response(data, { headers: { 'Content-Type': type } }));
  saved.add(String(id));
}
