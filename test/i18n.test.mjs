// Run with: node test/i18n.test.mjs
// Every string the app translates must be in every language file, with the same {placeholders}, and nothing stale.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const keys = new Set();
for (const f of ['app.js', 'api.js']) for (const [, k] of read(f).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(k);
// The landing page in index.html: see translate() in i18n.js.
const html = read('index.html');
for (const [, , k] of html.matchAll(/<(\w+)[^>]* data-i18n(?:-html)?(?=[ >])[^>]*>(.*?)<\/\1>/g)) keys.add(k.trim());
for (const [, k] of html.matchAll(/<img data-i18n-alt [^>]*alt="([^"]*)"/g)) keys.add(k);
assert.ok(keys.size > 150, `only found ${keys.size} strings`);

const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const tags = (s) => (s.match(/<[^>]+>/g) || []).join();
for (const code of ['de', 'es', 'fr', 'it', 'nl', 'pt']) {
  const dict = (await import(`../locales/${code}.js`)).default;
  for (const k of keys) {
    assert.ok(dict[k]?.trim(), `${code}: missing "${k}"`);
    assert.equal(holes(dict[k]), holes(k), `${code}: placeholders differ in "${k}"`);
    assert.equal(tags(dict[k]), tags(k), `${code}: markup differs in "${k}"`);
  }
  for (const k of Object.keys(dict)) assert.ok(keys.has(k), `${code}: "${k}" is no longer used`);
}
console.log(`i18n: ${keys.size} strings in 6 languages`);
