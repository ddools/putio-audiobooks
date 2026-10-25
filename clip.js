// A few seconds of a book's audio, cut straight from the file with range reads,
// for the speech recognition that finds the exact spot. Playback is never touched.
import { aacClip } from './m4b.js';

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// An MPEG audio layer III frame header at b[o], or null.
export function frameAt(b, o) {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[o + 1] >> 3) & 3; // 3: MPEG 1, 2: MPEG 2, 0: MPEG 2.5
  if (ver === 1 || ((b[o + 1] >> 1) & 3) !== 1) return null; // layer III only
  const kbps = BITRATES[ver === 3 ? 1 : 2][b[o + 2] >> 4];
  const rate = RATES[ver]?.[(b[o + 2] >> 2) & 3];
  if (!kbps || !rate) return null;
  const pad = (b[o + 2] >> 1) & 1;
  const mono = b[o + 3] >> 6 === 3;
  const spf = ver === 3 ? 1152 : 576;
  return { kbps, rate, spf, mono, ver, len: Math.floor((spf / 8) * kbps * 1000 / rate) + pad };
}
// A header that is followed by another one, so a stray 0xFF in the audio isn't taken for a frame.
function syncAt(b, from) {
  for (let o = from; o + 4 <= b.length; o++) {
    const f = frameAt(b, o);
    if (!f) continue;
    const g = frameAt(b, o + f.len);
    if (g && g.rate === f.rate) return o;
  }
  return -1;
}

// Where the audio starts, how long it runs, and how to turn a time into a byte offset.
// head: bytes of the file from offset `base`. From 0, 64 KB is plenty unless the ID3 tag holds big pictures;
// then { skip } says where the tag ends, to call again with the bytes from there.
export function mp3Layout(head, size, base = 0) {
  let audio = 0;
  if (!base && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) { // "ID3"
    audio = 10 + ((head[6] & 0x7f) << 21 | (head[7] & 0x7f) << 14 | (head[8] & 0x7f) << 7 | (head[9] & 0x7f));
    if (head[5] & 0x10) audio += 10;
    if (audio + 8192 > head.length) return { skip: audio };
  }
  const at = syncAt(head, audio);
  const f = at >= 0 && frameAt(head, at);
  if (!f) return null;
  const side = f.ver === 3 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17);
  const tag = String.fromCharCode(...head.subarray(at + 4 + side, at + 8 + side));
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const o = base + at;
  let frames = 0, bytes = size - o, toc = null;
  if (tag === 'Xing' || tag === 'Info') {
    let p = at + 8 + side;
    const flags = dv.getUint32(p); p += 4;
    if (flags & 1) { frames = dv.getUint32(p); p += 4; }
    if (flags & 2) { bytes = dv.getUint32(p) || bytes; p += 4; }
    if (flags & 4 && tag === 'Xing') toc = head.slice(p, p + 100);
  } else if (String.fromCharCode(...head.subarray(at + 36, at + 40)) === 'VBRI') {
    bytes = dv.getUint32(at + 46) || bytes;
    frames = dv.getUint32(at + 50);
  }
  const duration = frames ? (frames * f.spf) / f.rate : (bytes * 8) / (f.kbps * 1000);
  // The Xing table gives a byte position for each percent of the time; between entries, a straight line.
  const toByte = (t) => {
    const p = Math.min(99.999, Math.max(0, (t / duration) * 100));
    if (!toc) return o + Math.round((p / 100) * bytes);
    const i = Math.floor(p);
    const a = toc[i], b = i < 99 ? toc[i + 1] : 256;
    return o + Math.round(((a + (b - a) * (p - i)) / 256) * bytes);
  };
  const toTime = (byte) => {
    const x = ((byte - o) / bytes) * 256;
    if (!toc) return ((byte - o) / bytes) * duration;
    let i = 0;
    while (i < 99 && toc[i + 1] <= x) i++;
    const a = toc[i], b = i < 99 ? toc[i + 1] : 256;
    return ((i + (b > a ? (x - a) / (b - a) : 0)) / 100) * duration;
  };
  return { audio: o, duration, kbps: (bytes * 8) / duration / 1000, toByte, toTime };
}

// reader = { size, read(offset, length) -> Promise<Uint8Array> }, as httpReader in m4b.js.
// when(duration) gives the start in seconds, as a file's length is only known once its header is read.
// Resolves to { data, start, duration }: bytes decodeAudioData can read, where they really start, and the file's length in seconds.
export async function audioClip(reader, name, when, seconds) {
  if (/\.(m4b|m4a|mp4)$/i.test(name)) return aacClip(reader, when, seconds);
  if (!/\.mp3$/i.test(name)) throw new Error('Unsupported format');
  let layout = mp3Layout(await reader.read(0, 65536), reader.size);
  if (layout?.skip) layout = mp3Layout(await reader.read(layout.skip, 65536), reader.size, layout.skip);
  if (!layout) throw new Error('Not an MP3 we can read');
  const start = Math.max(0, Math.min(when(layout.duration), layout.duration - seconds));
  const from = Math.max(layout.audio, layout.toByte(start) - 4096);
  const length = Math.ceil(((seconds + 2) * layout.kbps * 1000) / 8) + 8192;
  const raw = await reader.read(from, length);
  const o = syncAt(raw, 0);
  if (o < 0) throw new Error('No MP3 frames there');
  return { data: raw.slice(o), start: layout.toTime(from + o), duration: layout.duration };
}

// A reader over a Blob, for books downloaded to the device.
export const blobReader = (blob) => ({
  size: blob.size,
  read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
});
