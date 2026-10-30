// Run with: node test/m4b.test.mjs
import assert from 'node:assert/strict';
import { parseId3, parseM4b } from '../m4b.js';

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

// D: an M4B cover, only when asked for
const png = [0x89, 0x50, 0x4e, 0x47];
const covr = atom('covr', atom('data', u32(14), u32(0), png));
const withCover = bytes(ftyp, atom('moov', mvhd, atom('udta', atom('meta', u32(0), atom('ilst', item('©alb', 'Pictured'), covr)))));
const d = await parseM4b(reader(withCover), true);
assert.equal(d.tags.album, 'Pictured');
assert.deepEqual([d.tags.cover.type, [...d.tags.cover.data]], ['image/png', png]);
assert.equal((await parseM4b(reader(withCover))).tags.cover, undefined);

// E: ID3 tags in an MP3: v2.3 with Latin-1, UTF-16 and a picture, and v2.2's three-letter frames
const syncsafe = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const id3 = (v, frames) => bytes(text('ID3'), v, 0, 0, syncsafe(frames.length + 4), frames, 0, 0, 0, 0, [0xff, 0xfb]);
const frame3 = (id, ...parts) => { const b = bytes(...parts); return bytes(text(id), u32(b.length), 0, 0, b); };
const utf16 = (s) => [0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0), 0])];
const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const v3 = id3(3, bytes(
  frame3('TALB', 0, text('Dune')),
  frame3('TPE1', 1, utf16('Frank Herbert'), 0, 0),
  frame3('APIC', 1, text('image/jpeg'), 0, 3, utf16('Front'), 0, 0, jpeg)));
const e = await parseId3(reader(v3), true);
assert.deepEqual([e.tags.album, e.tags.artist, e.tags.cover.type, [...e.tags.cover.data]], ['Dune', 'Frank Herbert', 'image/jpeg', jpeg]);
assert.equal((await parseId3(reader(v3))).tags.cover, undefined);
const frame2 = (id, ...parts) => { const b = bytes(...parts); return bytes(text(id), 0, b.length >> 8, b.length & 255, b); };
const v2 = await parseId3(reader(id3(2, bytes(frame2('TAL', 3, text('Emma')), frame2('TP1', 0, text('Jane Austen'))))));
assert.deepEqual([v2.tags.album, v2.tags.artist], ['Emma', 'Jane Austen']);
assert.deepEqual(await parseId3(reader(bytes([0xff, 0xfb, 0x90, 0x00]))), { tags: {} });

console.log('m4b.js ok');
