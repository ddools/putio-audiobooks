import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { scan } from '../scan.js';
import { ROOT, list, url } from '../demo.js';

test('the demo library scans into its three books, and every track is on disk', async () => {
  const books = await scan(ROOT, async (id) => ({ files: list(id) }));
  assert.deepEqual(
    books.map((b) => `${b.author}: ${b.title} (${b.tracks.length})`).sort(),
    ['Alice Gerstenberg: Alice in Wonderland (4)', 'Edythe Mae Gordon: Selected Poems (6)', 'W. W. Denslow: The Three Bears (1)'],
  );
  for (const t of books.flatMap((b) => b.tracks)) {
    const path = new URL('../' + url(t.id), import.meta.url);
    assert.ok(existsSync(path), `${url(t.id)} is missing`);
    assert.equal(statSync(path).size, t.size);
  }
});
