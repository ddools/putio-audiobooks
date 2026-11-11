// Run with: node test/offline.test.mjs
import assert from 'node:assert/strict';

// A minimal stand-in for the browser Cache API.
const entries = new Map();
const cache = {
  keys: async () => [...entries.keys()].map((k) => ({ url: 'https://app.test/' + k })),
  put: async (k, res) => { entries.set(k, { body: await res.arrayBuffer(), type: res.headers.get('Content-Type'), headers: [...res.headers] }); },
  match: async (k) => { const e = entries.get(k); return e && new Response(e.body, { headers: e.headers }); },
  delete: async (k) => entries.delete(k.url ? k.url.replace('https://app.test/', '') : k),
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

// A track bigger than one part comes down in ranged parts, and a dropped part is retried.
const { PART } = offline;
const size = PART * 2 + 5;
const big = { tracks: [{ id: 3, name: 'long.m4b', size }] };
let drops = 1, asked = [];
globalThis.fetch = async (url, init) => {
  const [, from, to] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range).map(Number);
  asked.push(from);
  const len = to - from + 1;
  const drop = from === PART && drops-- > 0;
  const body = new ReadableStream({
    start(ctl) {
      ctl.enqueue(new Uint8Array(Math.min(len, 1000)).fill(from / PART + 1));
      if (drop) return ctl.error(new Error('dropped'));
      if (len > 1000) ctl.enqueue(new Uint8Array(len - 1000).fill(from / PART + 1));
      ctl.close();
    },
  });
  return new Response(body, { status: 206 });
};
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realTimeout(fn, 0); // no waiting between retries here
const progress = [];
await offline.download(big, getUrl, (p) => progress.push(p));
assert.deepEqual(asked, [0, PART, PART, 2 * PART]);
assert.equal(progress.at(-1), 1);
assert.equal(entries.get('offline/3').body.byteLength, 0); // the marker
assert.equal(entries.get('offline/3/part-2').body.byteLength, 5);
assert.equal(offline.has(3), true);
const file = await offline.blob(3);
assert.equal(file.size, size);
assert.equal(file.type, 'audio/mp4');
assert.deepEqual([...new Uint8Array(await file.slice(PART - 1, PART + 1).arrayBuffer())], [1, 2]);

// A stopped download keeps its finished parts, and resumes from them.
await offline.remove(big);
assert.equal(entries.size, 0);
drops = Infinity; asked = [];
await assert.rejects(offline.download(big, getUrl, () => {}));
assert.ok(entries.has('offline/3/part-0'));
assert.equal(offline.has(3), false);
drops = 0; asked = [];
await offline.download(big, getUrl, () => {});
assert.deepEqual(asked, [PART, 2 * PART]);
globalThis.setTimeout = realTimeout;

// Leftover parts of a book that left the library are cleaned up.
entries.delete('offline/3');
await offline.init();
await offline.keepOnly(new Set());
assert.equal(entries.size, 0);

console.log('offline.js ok');
