// Reads chapter markers and basic tags out of an M4B/M4A file without
// downloading it. Only the handful of 64 KB blocks that hold the
// container index are fetched, using HTTP Range requests.

const BLOCK = 65536;

// reader = { size, read(offset, length) -> Promise<Uint8Array> }
export function httpReader(url, size) {
  const blocks = new Map();
  let requests = 0;

  async function fetchRange(start, end) {
    if (++requests > 80) throw new Error('Too many range requests');
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status !== 206) {
      try { await res.body?.cancel(); } catch {}
      throw new Error('Server ignored the Range request');
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  return {
    size,
    async read(offset, length) {
      const end = Math.min(size, offset + length);
      if (end <= offset) return new Uint8Array(0);
      const first = Math.floor(offset / BLOCK);
      const last = Math.floor((end - 1) / BLOCK);
      for (let b = first; b <= last;) {
        if (blocks.has(b)) { b++; continue; }
        let e = b;
        while (e + 1 <= last && !blocks.has(e + 1)) e++;
        const data = await fetchRange(b * BLOCK, Math.min(size, (e + 1) * BLOCK) - 1);
        for (let i = b; i <= e; i++) blocks.set(i, data.subarray((i - b) * BLOCK, (i - b + 1) * BLOCK));
        b = e + 1;
      }
      const out = new Uint8Array(end - offset);
      for (let i = first; i <= last; i++) {
        const blk = blocks.get(i);
        const base = i * BLOCK;
        const from = Math.max(offset, base);
        const to = Math.min(end, base + blk.length);
        if (to > from) out.set(blk.subarray(from - base, to - base), from - offset);
      }
      return out;
    },
  };
}

const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const u64 = (dv, o) => dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4);
const ascii = (u8, o, n) => String.fromCharCode(...u8.subarray(o, o + n));

async function atomAt(r, off, limit) {
  if (off + 8 > limit) return null;
  const b = await r.read(off, 16);
  if (b.length < 8) return null;
  const dv = view(b);
  let size = dv.getUint32(0);
  let head = 8;
  if (size === 1) {
    if (b.length < 16) return null;
    size = u64(dv, 8);
    head = 16;
  } else if (size === 0) {
    size = limit - off;
  }
  if (size < head) return null;
  return { type: ascii(b, 4, 4), start: off, body: off + head, end: Math.min(off + size, limit) };
}

async function kids(r, from, to) {
  const out = [];
  let off = from;
  while (off + 8 <= to && out.length < 4096) {
    const a = await atomAt(r, off, to);
    if (!a) break;
    out.push(a);
    off = a.end;
  }
  return out;
}

const body = (r, a, max = 4 << 20) => r.read(a.body, Math.min(a.end - a.body, max));

function decodeText(u8) {
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  return new TextDecoder('utf-8').decode(u8);
}

// Nero-style chapters: moov/udta/chpl. Times are in 100 ns units.
async function neroChapters(r, udta) {
  if (!udta) return [];
  const chpl = (await kids(r, udta.body, udta.end)).find((a) => a.type === 'chpl');
  if (!chpl) return [];
  const b = await body(r, chpl);
  const dv = view(b);
  let o = 4;
  if (b[0]) o += 4;
  const count = b[o++];
  const out = [];
  for (let i = 0; i < count && o + 9 <= b.length; i++) {
    const start = u64(dv, o) / 1e7;
    const len = b[o + 8];
    out.push({ title: decodeText(b.subarray(o + 9, o + 9 + len)).trim(), start });
    o += 9 + len;
  }
  return out;
}

// QuickTime-style chapters: a text track referenced by another track's tref/chap.
async function quicktimeChapters(r, traks) {
  const info = [];
  for (const trak of traks) {
    const parts = await kids(r, trak.body, trak.end);
    const tkhd = parts.find((a) => a.type === 'tkhd');
    if (!tkhd) continue;
    const tb = await r.read(tkhd.body, 32);
    const id = view(tb).getUint32(tb[0] === 1 ? 20 : 12);
    let chap = [];
    const tref = parts.find((a) => a.type === 'tref');
    if (tref) {
      const ref = (await kids(r, tref.body, tref.end)).find((a) => a.type === 'chap');
      if (ref) {
        const rb = await body(r, ref, 4096);
        const dv = view(rb);
        for (let o = 0; o + 4 <= rb.length; o += 4) chap.push(dv.getUint32(o));
      }
    }
    info.push({ id, chap, mdia: parts.find((a) => a.type === 'mdia') });
  }
  const wanted = new Set(info.flatMap((t) => t.chap));
  const track = info.find((t) => wanted.has(t.id) && t.mdia);
  if (!track) return [];

  const mdia = await kids(r, track.mdia.body, track.mdia.end);
  const mdhd = mdia.find((a) => a.type === 'mdhd');
  const minf = mdia.find((a) => a.type === 'minf');
  if (!mdhd || !minf) return [];
  const mb = await r.read(mdhd.body, 32);
  const timescale = view(mb).getUint32(mb[0] === 1 ? 20 : 12) || 1;
  const stbl = (await kids(r, minf.body, minf.end)).find((a) => a.type === 'stbl');
  if (!stbl) return [];
  const t = Object.fromEntries((await kids(r, stbl.body, stbl.end)).map((a) => [a.type, a]));
  if (!t.stts || !t.stsc || !t.stsz || !(t.stco || t.co64)) return [];

  const MAX = 5000;
  const stsz = view(await body(r, t.stsz));
  const fixed = stsz.getUint32(4);
  const n = Math.min(stsz.getUint32(8), MAX);
  const sizes = Array.from({ length: n }, (_, i) => fixed || stsz.getUint32(12 + i * 4));

  const stts = view(await body(r, t.stts));
  const starts = [];
  let clock = 0;
  for (let i = 0, e = stts.getUint32(4); i < e && starts.length < n; i++) {
    const count = stts.getUint32(8 + i * 8);
    const delta = stts.getUint32(12 + i * 8);
    for (let j = 0; j < count && starts.length < n; j++) { starts.push(clock / timescale); clock += delta; }
  }

  const co = view(await body(r, t.stco || t.co64));
  const wide = !t.stco;
  const chunkCount = co.getUint32(4);
  const chunkOffset = (i) => (wide ? u64(co, 8 + i * 8) : co.getUint32(8 + i * 4));

  const stsc = view(await body(r, t.stsc));
  const runs = [];
  for (let i = 0, e = stsc.getUint32(4); i < e; i++) {
    runs.push({ first: stsc.getUint32(8 + i * 12), per: stsc.getUint32(12 + i * 12) });
  }

  const offsets = [];
  let run = 0;
  for (let c = 1; c <= chunkCount && offsets.length < n; c++) {
    while (run + 1 < runs.length && runs[run + 1].first <= c) run++;
    let off = chunkOffset(c - 1);
    for (let i = 0; i < (runs[run]?.per || 0) && offsets.length < n; i++) {
      offsets.push(off);
      off += sizes[offsets.length - 1];
    }
  }

  const out = [];
  for (let i = 0; i < offsets.length && i < starts.length; i++) {
    if (sizes[i] < 2) continue;
    const s = await r.read(offsets[i], Math.min(sizes[i], 1024));
    const len = Math.min(view(s).getUint16(0), s.length - 2);
    out.push({ title: decodeText(s.subarray(2, 2 + len)).trim(), start: starts[i] });
  }
  return out;
}

// iTunes-style tags: moov/udta/meta/ilst. Only the short text ones.
async function tags(r, udta) {
  const out = {};
  if (!udta) return out;
  const meta = (await kids(r, udta.body, udta.end)).find((a) => a.type === 'meta');
  if (!meta) return out;
  let inner = await kids(r, meta.body + 4, meta.end);
  if (!inner.some((a) => a.type === 'ilst')) inner = await kids(r, meta.body, meta.end);
  const ilst = inner.find((a) => a.type === 'ilst');
  if (!ilst) return out;
  const want = { '©nam': 'title', '©ART': 'artist', aART: 'albumArtist', '©alb': 'album' };
  for (const item of await kids(r, ilst.body, ilst.end)) {
    const key = want[item.type];
    if (!key || item.end - item.body > 2048) continue;
    const data = (await kids(r, item.body, item.end)).find((a) => a.type === 'data');
    if (!data) continue;
    const b = await body(r, data, 2048);
    if (b.length > 8) out[key] = decodeText(b.subarray(8)).trim();
  }
  return out;
}

export async function parseM4b(r) {
  const top = await kids(r, 0, r.size);
  const moov = top.find((a) => a.type === 'moov');
  if (!moov) return { duration: 0, chapters: [], tags: {} };
  const inside = await kids(r, moov.body, moov.end);

  let duration = 0;
  const mvhd = inside.find((a) => a.type === 'mvhd');
  if (mvhd) {
    const b = await r.read(mvhd.body, 36);
    const dv = view(b);
    duration = b[0] === 1 ? u64(dv, 24) / (dv.getUint32(20) || 1) : dv.getUint32(16) / (dv.getUint32(12) || 1);
  }

  const udta = inside.find((a) => a.type === 'udta');
  let chapters = [];
  try { chapters = await neroChapters(r, udta); } catch {}
  if (chapters.length < 2) {
    try {
      const qt = await quicktimeChapters(r, inside.filter((a) => a.type === 'trak'));
      if (qt.length > chapters.length) chapters = qt;
    } catch {}
  }

  chapters = chapters
    .filter((c) => Number.isFinite(c.start) && c.start >= 0 && (!duration || c.start < duration))
    .sort((a, b) => a.start - b.start)
    .filter((c, i, all) => i === 0 || c.start - all[i - 1].start > 0.5);
  chapters.forEach((c, i) => {
    c.end = i + 1 < chapters.length ? chapters[i + 1].start : duration || c.start;
    if (!c.title) c.title = `Chapter ${i + 1}`;
  });

  let meta = {};
  try { meta = await tags(r, udta); } catch {}
  return { duration, chapters, tags: meta };
}

/* ---------- a stretch of audio, for speech recognition ---------- */

// Reads an MPEG-4 descriptor's length: up to four bytes of seven bits each.
function descLen(b, o) {
  let n = 0;
  for (let i = 0; i < 4; i++) { const c = b[o + i]; n = (n << 7) | (c & 0x7f); if (!(c & 0x80)) return [n, o + i + 1]; }
  return [n, o + 4];
}
// The AAC decoder config from esds, reduced to what an ADTS header can say.
function audioConfig(b) {
  let o = 4; // version and flags
  const find = (tag) => {
    while (o < b.length) {
      const t = b[o];
      const [len, next] = descLen(b, o + 1);
      if (t === tag) return [len, next];
      if (t === 0x03) { o = next + 3; if (b[next + 2] & 0x80) o += 2; if (b[next + 2] & 0x40) o += 1 + b[o]; if (b[next + 2] & 0x20) o += 2; continue; }
      if (t === 0x04) { o = next + 13; continue; }
      o = next + len;
    }
    return null;
  };
  const dsi = find(0x05);
  if (!dsi) return null;
  const asc = b.subarray(dsi[1], dsi[1] + dsi[0]);
  let bit = 0;
  const bits = (n) => { let v = 0; for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((asc[bit >> 3] >> (7 - (bit & 7))) & 1); return v; };
  let aot = bits(5);
  if (aot === 31) aot = 32 + bits(6);
  let freq = bits(4);
  if (freq === 15) { bits(24); freq = -1; }
  const channels = bits(4);
  // HE-AAC: the core is plain AAC at half the rate; decoders bring the rest back by themselves.
  if (aot === 5 || aot === 29) {
    const ext = bits(4);
    if (ext === 15) bits(24);
    aot = bits(5);
  }
  return aot >= 1 && aot <= 4 && freq >= 0 && channels > 0 ? { profile: aot - 1, freq, channels } : null;
}

// `seconds` of audio from when(duration) seconds in, as ADTS AAC that decodeAudioData can read. Only the
// sample tables' few needed entries and the audio itself are read, never the whole file.
// Resolves to { data, start, duration }: start is where the clip really begins.
export async function aacClip(r, when, seconds) {
  const moov = (await kids(r, 0, r.size)).find((a) => a.type === 'moov');
  if (!moov) throw new Error('No moov');
  for (const trak of (await kids(r, moov.body, moov.end)).filter((a) => a.type === 'trak')) {
    const mdia = (await kids(r, trak.body, trak.end)).find((a) => a.type === 'mdia');
    if (!mdia) continue;
    const parts = await kids(r, mdia.body, mdia.end);
    const hdlr = parts.find((a) => a.type === 'hdlr');
    if (!hdlr || ascii(await r.read(hdlr.body + 8, 4), 0, 4) !== 'soun') continue;
    const mb = await r.read(parts.find((a) => a.type === 'mdhd').body, 32);
    const timescale = view(mb).getUint32(mb[0] === 1 ? 20 : 12) || 1;
    const duration = (mb[0] === 1 ? u64(view(mb), 24) : view(mb).getUint32(16)) / timescale;
    const minf = parts.find((a) => a.type === 'minf');
    const stbl = minf && (await kids(r, minf.body, minf.end)).find((a) => a.type === 'stbl');
    if (!stbl) continue;
    const t = Object.fromEntries((await kids(r, stbl.body, stbl.end)).map((a) => [a.type, a]));
    if (!t.stsd || !t.stts || !t.stsc || !t.stsz || !(t.stco || t.co64)) continue;

    const entry = await atomAt(r, t.stsd.body + 8, t.stsd.end);
    if (!entry || entry.type !== 'mp4a') throw new Error(`Unsupported audio: ${entry?.type}`);
    const version = view(await r.read(entry.body + 8, 2)).getUint16(0);
    const esds = (await kids(r, entry.body + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0), entry.end)).find((a) => a.type === 'esds');
    const cfg = esds && audioConfig(await body(r, esds, 4096));
    if (!cfg) throw new Error('Unsupported AAC config');

    // stts: which sample is playing at `start`, and when it began.
    const stts = view(await body(r, t.stts, 1 << 20));
    const want = Math.max(0, Math.min(when(duration), duration - seconds)) * timescale;
    let first = 0, clock = 0, delta = 1024;
    for (let i = 0, e = stts.getUint32(4); i < e; i++) {
      const count = stts.getUint32(8 + i * 8);
      delta = stts.getUint32(12 + i * 8) || 1;
      if (clock + count * delta > want) { const k = Math.floor((want - clock) / delta); first += k; clock += k * delta; break; }
      first += count; clock += count * delta;
    }
    const begins = clock / timescale;
    const frames = Math.ceil((seconds * timescale) / delta);

    // stsc: the chunk that holds `first`, and the first sample in that chunk.
    const stsc = view(await body(r, t.stsc, 4 << 20));
    const runs = [];
    for (let i = 0, e = stsc.getUint32(4); i < e; i++) runs.push([stsc.getUint32(8 + i * 12), stsc.getUint32(12 + i * 12)]);
    const coBox = t.stco || t.co64;
    const chunkCount = view(await r.read(coBox.body + 4, 4)).getUint32(0);
    const chunkOffset = async (c) => {
      const b = await r.read(coBox.body + 8 + c * (t.co64 ? 8 : 4), t.co64 ? 8 : 4);
      return t.co64 ? u64(view(b), 0) : view(b).getUint32(0);
    };
    let chunk = 0, sample = 0, run = 0;
    for (;;) {
      const per = runs[run]?.[1] || 1;
      const nextFirst = run + 1 < runs.length ? runs[run + 1][0] - 1 : chunkCount;
      const span = (nextFirst - chunk) * per;
      if (sample + span > first || run + 1 >= runs.length) {
        const skip = Math.floor((first - sample) / per);
        chunk += skip; sample += skip * per;
        break;
      }
      sample += span; chunk = nextFirst; run++;
    }
    const sz = view(await r.read(t.stsz.body, 12));
    const fixed = sz.getUint32(4), total = sz.getUint32(8);
    const last = Math.min(total, first + frames);
    const sizes = fixed ? null : view(await r.read(t.stsz.body + 12 + sample * 4, (last - sample) * 4));
    const sizeOf = (i) => fixed || sizes.getUint32((i - sample) * 4);

    const out = [];
    let i = sample;
    while (i < last && chunk < chunkCount) {
      while (run + 1 < runs.length && runs[run + 1][0] - 1 <= chunk) run++;
      const per = runs[run][1];
      let off = await chunkOffset(chunk);
      for (let k = 0; k < per && i < last; k++, i++) {
        const size = sizeOf(i);
        if (i >= first) out.push([off, size]);
        off += size;
      }
      chunk++;
    }
    if (!out.length) throw new Error('No audio there');
    const from = out[0][0], to = out.at(-1)[0] + out.at(-1)[1];
    const raw = to - from < 8 << 20 ? await r.read(from, to - from) : null; // usually one stretch of the file
    const data = new Uint8Array(out.reduce((n, [, s]) => n + s + 7, 0));
    let o = 0;
    for (const [off, size] of out) {
      const len = size + 7;
      data.set([0xff, 0xf1, (cfg.profile << 6) | (cfg.freq << 2) | (cfg.channels >> 2), ((cfg.channels & 3) << 6) | (len >> 11),
        (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc], o);
      data.set(raw && off >= from && off + size <= to ? raw.subarray(off - from, off - from + size) : await r.read(off, size), o + 7);
      o += len;
    }
    return { data, start: begins, duration };
  }
  throw new Error('No audio track');
}
