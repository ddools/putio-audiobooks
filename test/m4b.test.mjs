// Run with: node test/m4b.test.mjs
import assert from 'node:assert/strict';
import { parseM4b } from '../m4b.js';

const bytes = (...parts) => Uint8Array.from(parts.map((p) => [...(typeof p === 'number' ? [p] : p)]).flat(Infinity));
const u32 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n) => [...u32(Math.floor(n / 4294967296)), ...u32(n >>> 0)];
const text = (s) => [...new TextEncoder().encode(s)];
const atom = (type, ...parts) => {
  const body = bytes(...parts);
  return bytes(u32(8 + body.length), [...type].map((c) => c.charCodeAt(0)), body);
};
const reader = (u8) => ({ size: u8.length, read: async (o, n) => u8.slice(o, o + n) });
const mvhd = atom('mvhd', 0, 0, 0, 0, u32(0), u32(0), u32(1000), u32(3600000));
const item = (type, s) => atom(type, atom('data', u32(1), u32(0), text(s)));

// A: Nero chapters and iTunes tags
const chapter = (sec, title) => [u64(sec * 1e7), title.length, text(title)];
const chpl = atom('chpl', 1, 0, 0, 0, u32(0), 3, chapter(0, 'One'), chapter(1200, ''), chapter(2400, 'Three'));
const meta = atom('meta', u32(0), atom('ilst', item('©alb', 'The Book'), item('©ART', 'Some Author')));
const ftyp = atom('ftyp', text('M4B '), u32(0));
const a = await parseM4b(reader(bytes(ftyp, atom('moov', mvhd, atom('udta', chpl, meta)), atom('mdat', [1, 2, 3]))));
assert.equal(a.duration, 3600);
assert.deepEqual(a.chapters, [
  { title: 'One', start: 0, end: 1200 },
  { title: 'Chapter 2', start: 1200, end: 2400 },
  { title: 'Three', start: 2400, end: 3600 },
]);
assert.equal(a.tags.album, 'The Book');
assert.equal(a.tags.artist, 'Some Author');

// B: QuickTime chapters; a text track whose two samples sit in an mdat right after ftyp
const sample = (s) => [0, s.length, ...text(s)];
const samples = [sample('Intro'), sample('Middle')];
const mdat = atom('mdat', samples);
const first = ftyp.length + 8; // absolute offset of the first sample
const tkhd = (id) => atom('tkhd', 0, 0, 0, 0, u32(0), u32(0), u32(id));
const stbl = atom('stbl',
  atom('stts', u32(0), u32(1), u32(2), u32(600000)),
  atom('stsc', u32(0), u32(1), u32(1), u32(2), u32(1)),
  atom('stsz', u32(0), u32(0), u32(2), u32(samples[0].length), u32(samples[1].length)),
  atom('stco', u32(0), u32(1), u32(first)));
const mdia = atom('mdia', atom('mdhd', 0, 0, 0, 0, u32(0), u32(0), u32(1000)), atom('minf', stbl));
const moovB = atom('moov', mvhd,
  atom('trak', tkhd(1), atom('tref', atom('chap', u32(2)))),
  atom('trak', tkhd(2), mdia));
const b = await parseM4b(reader(bytes(ftyp, mdat, moovB)));
assert.deepEqual(b.chapters.map((c) => [c.title, c.start]), [['Intro', 0], ['Middle', 600]]);

// C: no moov
assert.deepEqual(await parseM4b(reader(bytes(ftyp, mdat))), { duration: 0, chapters: [], tags: {} });

console.log('m4b.js ok');
