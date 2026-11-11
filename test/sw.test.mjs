// Run with: node test/sw.test.mjs
// Downloaded books come out of the service worker a range at a time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const handlers = {};
const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
  self: { addEventListener: (type, fn) => { handlers[type] = fn; }, location: new URL('https://app.test/') },
  caches: { match: async (u) => ({
    'https://app.test/offline/7': () => new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } }),
    // A track saved in parts: a marker, then its pieces.
    'https://app.test/offline/9': () => new Response(null, { headers: { 'Content-Type': 'audio/mp4', 'X-Parts': '3' } }),
    'https://app.test/offline/9/part-0': () => new Response(bytes.slice(0, 40)),
    'https://app.test/offline/9/part-1': () => new Response(bytes.slice(40, 80)),
    'https://app.test/offline/9/part-2': () => new Response(bytes.slice(80)),
  })[u]?.() },
  fetch: async () => new Response(null, { status: 404 }),
  URL, Response, Blob,
});
const ask = (path, range) => {
  let res;
  handlers.fetch({ request: new Request('https://app.test/' + path, { headers: range ? { range } : {} }), respondWith: (p) => { res = p; } });
  return res;
};
const body = async (res) => [...new Uint8Array(await res.arrayBuffer())];

let res = await ask('offline/7', 'bytes=10-19');
assert.equal(res.status, 206);
assert.equal(res.headers.get('Content-Range'), 'bytes 10-19/100');
assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
assert.deepEqual(await body(res), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

assert.equal((await ask('offline/7', 'bytes=90-')).headers.get('Content-Range'), 'bytes 90-99/100');
assert.equal((await ask('offline/7', 'bytes=95-500')).headers.get('Content-Range'), 'bytes 95-99/100');
assert.deepEqual(await body(await ask('offline/7', 'bytes=-3')), [97, 98, 99]);
assert.equal((await ask('offline/7', 'bytes=100-')).status, 416);
res = await ask('offline/7');
assert.equal(res.status, 200);
assert.equal((await body(res)).length, 100);
assert.equal((await ask('offline/8', 'bytes=0-')).status, 404); // evicted: falls through to the network

res = await ask('offline/9', 'bytes=38-42');
assert.equal(res.status, 206);
assert.equal(res.headers.get('Content-Range'), 'bytes 38-42/100');
assert.equal(res.headers.get('Content-Type'), 'audio/mp4');
assert.deepEqual(await body(res), [38, 39, 40, 41, 42]);
res = await ask('offline/9');
assert.equal(res.status, 200);
assert.deepEqual(await body(res), [...bytes]);

console.log('sw.js ok');
