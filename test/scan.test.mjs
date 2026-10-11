// Run with: node test/scan.test.mjs
import assert from 'node:assert/strict';
import { scan, trackTitle } from '../scan.js';

// A fake put.io: folder id -> its files. Listings answer a tick later, so overlap can be counted.
let nextId = 1;
const tree = new Map();
const dir = (name, ...kids) => { const id = nextId++; tree.set(id, kids); return { id, name, file_type: 'FOLDER' }; };
const file = (name) => ({ id: nextId++, name, file_type: 'AUDIO', size: 10, created_at: '2026-01-01' });
let active = 0;
let peak = 0;
const listFiles = async (id) => {
  peak = Math.max(peak, ++active);
  await new Promise((r) => setTimeout(r, 1));
  active--;
  return { files: tree.get(id) };
};

const loose = file('Andy Weir - The Martian.m4b');
const root = dir('Audiobooks',
  loose,
  dir('Stephen King - 11.22.63', file('book.m4b')),
  dir('Stephen King',
    file('It.m4b'),
    dir('The Stand [Unabridged]', file('10 - Ten.mp3'), file('2 - Two.mp3'), file('notes.txt'), file('extras.zip'),
      dir('CD2', file('01.mp3')), dir('CD1', file('Track II.mp3'), file('Track I.mp3')))),
  dir('Parts', file('Dune 2.m4b'), file('Dune 1.m4b')),
  dir('Mixed', file('Emma.m4b'), file('Persuasion.m4b')),
  file('Zipped Book.RAR'),
  dir('L1', dir('L2', dir('L3', dir('L4', file('deep.mp3'), dir('L5', file('too deep.mp3')))))));

const archives = [];
const books = await scan(root, listFiles, archives);
const by = (title) => books.find((b) => b.title === title);

// A loose file in the library folder is a book; "Author - Title" gives the author.
assert.equal(by('The Martian').author, 'Andy Weir');
assert.equal(by('The Martian').id, 'f' + loose.id);

// A dotted ending on a folder name is not mistaken for a file extension.
assert.equal(by('11.22.63').author, 'Stephen King');

// MP3s in a folder are one book, with the parent folder as author: bracketed junk dropped, loose files first, then discs, all in natural order.
assert.equal(by('The Stand').author, 'Stephen King');
assert.deepEqual(by('The Stand').tracks.map((t) => t.name), ['2 - Two.mp3', '10 - Ten.mp3', 'Track I.mp3', 'Track II.mp3', '01.mp3']);

// M4Bs that differ only by a number are one book; otherwise each is its own, with the folder as author.
assert.deepEqual(by('Parts').tracks.map((t) => t.name), ['Dune 1.m4b', 'Dune 2.m4b']);
assert.equal(by('Emma').author, 'Mixed');
assert.equal(by('Persuasion').author, 'Mixed');

// A lone M4B beside other books' folders keeps its own name; the folder is the author, not the title.
assert.equal(by('It').author, 'Stephen King');

// Four levels down is scanned, five is not.
assert.ok(by('L4'));
assert.equal(books.length, 8);

// Archives are not books, but they are reported.
assert.deepEqual(archives.sort(), ['Zipped Book.RAR', 'extras.zip']);

assert.equal(trackTitle('03 - The Storm.mp3', 2), 'The Storm');
assert.equal(trackTitle('03.mp3', 2), 'Part 3');

// A wide, nested tree never has more than 4 listings in flight.
const wide = (depth) => dir('d', ...Array.from({ length: 6 }, () => (depth ? wide(depth - 1) : file('a.mp3'))));
peak = 0;
await scan(wide(2), listFiles);
assert.equal(peak, 4);

console.log('scan.js ok');
