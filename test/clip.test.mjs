// Run with: node test/clip.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioClip, blobReader, frameAt, mp3Layout } from '../clip.js';

const bytes = (...parts) => Uint8Array.from(parts.map((p) => [...(typeof p === 'number' ? [p] : p)]).flat(Infinity));
const u16 = (n) => [n >> 8, n & 255];
const u32 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s) => [...new TextEncoder().encode(s)];
const atom = (type, ...parts) => {
  const body = bytes(...parts);
  return bytes(u32(8 + body.length), text(type), body);
};
const reader = (u8) => ({ size: u8.length, read: async (o, n) => u8.slice(o, o + n) });

// A: an M4B whose AAC frames are numbered, 20 frames of 1024 samples at 1024 Hz (one per second),
// in chunks of 3, 3, 3, ... so a clip crosses chunk edges.
const RATE = 1024, N = 20;
const frames = Array.from({ length: N }, (_, i) => bytes(Array(5 + (i % 3)).fill(i)));
const ftyp = atom('ftyp', text('M4B '), u32(0));
const mdat = atom('mdat', ...frames);
const first = ftyp.length + 8;
const offsets = [];
for (let i = 0, off = first; i < N; i += 3) {
  offsets.push(off);
  for (let k = i; k < Math.min(N, i + 3); k++) off += frames[k].length;
}
// esds: ES descriptor > decoder config > AAC-LC, 44.1 kHz index (4), stereo
const asc = [(2 << 3) | (4 >> 1), ((4 & 1) << 7) | (2 << 3)];
const dsi = [0x05, asc.length, ...asc];
const dcd = [0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0), ...dsi];
const esd = [0x03, 3 + dcd.length, ...u16(1), 0, ...dcd];
const mp4a = atom('mp4a', Array(6).fill(0), u16(1), Array(8).fill(0), u16(2), u16(16), u16(0), u16(0), u32(RATE << 16), atom('esds', u32(0), esd));
const stbl = atom('stbl',
  atom('stsd', u32(0), u32(1), mp4a),
  atom('stts', u32(0), u32(1), u32(N), u32(1024)),
  atom('stsc', u32(0), u32(1), u32(1), u32(3), u32(1)),
  atom('stsz', u32(0), u32(0), u32(N), ...frames.map((f) => u32(f.length))),
  atom('stco', u32(0), u32(offsets.length), ...offsets.map(u32)));
const trak = atom('trak', atom('mdia',
  atom('mdhd', 0, 0, 0, 0, u32(0), u32(0), u32(RATE), u32(N * 1024)),
  atom('hdlr', u32(0), u32(0), text('soun'), u32(0), u32(0), u32(0), 0),
  atom('minf', stbl)));
const m4b = bytes(ftyp, mdat, atom('moov', atom('mvhd', u32(0), u32(0), u32(0), u32(1000), u32(N * 1000)), trak));

const clip = await audioClip(reader(m4b), 'book.m4b', (d) => { assert.equal(d, N); return 4.5; }, 5);
assert.equal(clip.start, 4);
assert.equal(clip.duration, N);
// Five ADTS frames, 4 to 8, each a 7-byte header and the frame's own bytes
const got = [];
for (let o = 0; o < clip.data.length;) {
  assert.equal(clip.data[o], 0xff);
  assert.equal(clip.data[o + 1], 0xf1);
  assert.equal(clip.data[o + 2] >> 6, 1, 'AAC-LC profile');
  assert.equal((clip.data[o + 2] >> 2) & 15, 4, '44.1 kHz index');
  const len = ((clip.data[o + 3] & 3) << 11) | (clip.data[o + 4] << 3) | (clip.data[o + 5] >> 5);
  got.push([...clip.data.slice(o + 7, o + len)]);
  o += len;
}
assert.deepEqual(got, frames.slice(4, 9).map((f) => [...f]));
// Near the end, the clip is pulled back to fit
assert.equal((await audioClip(reader(m4b), 'book.m4b', () => 19, 5)).start, 15);

// B: an MP3 frame header
const hdr = frameAt(Uint8Array.from([0xff, 0xfb, 0x50, 0xc4]), 0); // MPEG 1 layer III, 64 kbps, 44.1 kHz, mono
assert.deepEqual([hdr.kbps, hdr.rate, hdr.spf, hdr.mono, hdr.len], [64, 44100, 1152, true, 208]);

// C: the demo's MP3s, against their real lengths
const mp3 = (path) => { const b = readFileSync(new URL('../demo/audiobooks/' + path, import.meta.url)); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
const bears = mp3('W. W. Denslow/The Three Bears/The Three Bears.mp3');
const layout = mp3Layout(bears.subarray(0, 65536), bears.length);
assert.ok(Math.abs(layout.duration - 434.1) < 0.2);
const c = await audioClip(blobReader(new Blob([bears])), 'The Three Bears.mp3', () => 100, 20);
assert.ok(Math.abs(c.start - 100) < 1, `starts near 100s, not ${c.start}`);
assert.ok(frameAt(c.data, 0), 'starts on a frame');
assert.ok(c.data.length > 20 * 8000, 'holds 20 seconds at 64 kbps');
// An ID3 tag bigger than the first read
const act = mp3('Alice Gerstenberg/Alice in Wonderland/01 Act 1.mp3');
assert.ok(mp3Layout(act.subarray(0, 65536), act.length).skip);
const c2 = await audioClip(blobReader(new Blob([act])), '01 Act 1.mp3', (d) => d / 2, 20);
assert.ok(Math.abs(c2.duration - 2288.7) < 0.5);
assert.ok(Math.abs(c2.start - 2288.7 / 2) < 1);

await assert.rejects(audioClip(reader(m4b), 'book.flac', () => 0, 5), /Unsupported/);
console.log('clip.js ok');
