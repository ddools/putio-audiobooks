// Run with: node test/offline.test.mjs
import assert from 'node:assert/strict';

// A minimal stand-in for the browser Cache API.
const entries = new Map();
const cache = {
  keys: async () => [...entries.keys()].map((k) => ({ url: 'https://app.test/' + k })),
  put: async (k, res) => { entries.set(k, { body: await res.arrayBuffer(), type: res.headers.get('Content-Type') }); },
  match: async (k) => { const e = entries.get(k); return e && new Response(e.body, { headers: { 'Content-Type': e.type } }); },
  delete: async (k) => entries.delete(k),
};
globalThis.caches = { open: async () => cache, delete: async () => entries.clear() };

let fail = false;
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(url);
  const body = new ReadableStream({
    start(ctl) {
      ctl.enqueue(new Uint8Array(50));
      if (fail) ctl.error(new Error('dropped')); else { ctl.enqueue(new Uint8Array(50)); ctl.close(); }
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } });
};

const offline = await import('../offline.js');
const book = { tracks: [{ id: 1, name: 'a.mp3', size: 100 }, { id: 2, name: 'b.M4B', size: 100 }] };
const getUrl = async (id) => 'https://put.test/' + id;

await offline.init();
assert.equal(offline.hasBook(book), false);

// A connection that drops mid-track saves nothing for that track.
fail = true;
await assert.rejects(offline.download(book, getUrl, () => {}));
assert.equal(entries.size, 0);
fail = false;

const seen = [];
await offline.download(book, getUrl, (p) => seen.push(p));
assert.equal(offline.hasBook(book), true);
assert.equal(seen.at(-1), 1);
assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
assert.equal(entries.get('offline/1').type, 'audio/mpeg');
assert.equal(entries.get('offline/2').type, 'audio/mp4');

// Already-saved tracks are not fetched again.
fetched.length = 0;
await offline.download(book, getUrl, () => {});
assert.equal(fetched.length, 0);

const url = await offline.localUrl(1);
assert.match(url, /^blob:/);
assert.equal(await offline.localUrl(1), url);

// An entry the browser evicted is noticed, not served.
entries.delete('offline/2');
assert.equal(await offline.localUrl(2), null);
assert.equal(offline.has(2), false);

await offline.keepOnly(new Set(['99']));
assert.equal(offline.has(1), false);
assert.equal(entries.size, 0);

console.log('offline.js ok');
