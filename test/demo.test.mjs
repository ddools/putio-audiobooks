import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { scan } from '../scan.js';
import { ROOT, list, url } from '../demo.js';

test('the demo library scans into its four books, and every track is on disk', async () => {
  const books = await scan(ROOT, async (id) => ({ files: list(id) }));
  assert.deepEqual(
    books.map((b) => `${b.author}: ${b.title} (${b.tracks.length})`).sort(),
    ['Alice Gerstenberg: Alice in Wonderland (4)', 'Edythe Mae Gordon: Selected Poems (6)', 'Mary Shelley: Frankenstein (1)', 'W. W. Denslow: The Three Bears (1)'],
  );
  // Frankenstein comes with its EPUB, so the demo shows the reader.
  const epub = books.find((b) => b.title === 'Frankenstein').epub;
  assert.equal(epub?.name, 'Frankenstein.epub');
  assert.equal(statSync(new URL('../' + url(epub.id), import.meta.url)).size, epub.size);
  for (const t of books.flatMap((b) => b.tracks)) {
    const path = new URL('../' + url(t.id), import.meta.url);
    assert.ok(existsSync(path), `${url(t.id)} is missing`);
    assert.equal(statSync(path).size, t.size);
  }
});
