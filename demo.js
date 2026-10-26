// The sample library behind ?demo: public-domain LibriVox recordings in demo/audiobooks/ (and one EPUB), laid out as
// Author/Book/track. It answers api.js in put.io's shapes, so the real scanner and player run on it.
const BASE = 'demo/audiobooks/';
const FILES = [
  ['Alice Gerstenberg/Alice in Wonderland/00 Introduction.mp3', 1119232],
  ['Alice Gerstenberg/Alice in Wonderland/01 Act 1.mp3', 18428416],
  ['Alice Gerstenberg/Alice in Wonderland/02 Act 2.mp3', 16163328],
  ['Alice Gerstenberg/Alice in Wonderland/03 Act 3.mp3', 13222912],
  ['Edythe Mae Gordon/Selected Poems/01 I Understand.mp3', 583213],
  ['Edythe Mae Gordon/Selected Poems/02 One Summer\'s Day.mp3', 351019],
  ['Edythe Mae Gordon/Selected Poems/03 Tribute.mp3', 419204],
  ['Edythe Mae Gordon/Selected Poems/04 Love Me.mp3', 415438],
  ['Edythe Mae Gordon/Selected Poems/05 I See You.mp3', 362934],
  ['Edythe Mae Gordon/Selected Poems/06 Young Love.mp3', 439080],
  ['W. W. Denslow/The Three Bears/The Three Bears.mp3', 3473158],
  // Chapter I read by LibriVox, with the same text as an EPUB, so the demo can show the reader.
  ['Mary Shelley/Frankenstein/Chapter 1.mp3', 6033920],
  ['Mary Shelley/Frankenstein/Frankenstein.epub', 6826],
];

export const ROOT = { id: 1, name: 'Audiobooks' };
const folders = new Map([[0, [{ ...ROOT, file_type: 'FOLDER' }]], [ROOT.id, []]]);
const dirs = new Map([['', ROOT.id]]);
const urls = new Map();
// Ids follow the order of FILES, and saved positions are keyed by them: add new books at the end.
let next = ROOT.id + 1;
for (const [path, size] of FILES) {
  const parts = path.split('/');
  let dir = '';
  for (const name of parts.slice(0, -1)) {
    const parent = dirs.get(dir);
    dir += name + '/';
    if (dirs.has(dir)) continue;
    dirs.set(dir, next);
    folders.set(next, []);
    folders.get(parent).push({ id: next++, name, file_type: 'FOLDER' });
  }
  folders.get(dirs.get(dir)).push({ id: next, name: parts.at(-1), size, file_type: 'AUDIO', created_at: '2026-10-13T00:00:00' });
  urls.set(String(next++), BASE + parts.map(encodeURIComponent).join('/'));
}

export const list = (id) => folders.get(Number(id)) || [];
export const url = (id) => urls.get(String(id));
