// Just enough of a zip reader for EPUBs: the central directory, and stored or deflated entries.
// Inflating uses the browser's own DecompressionStream, so there is no library to ship.

const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// u8: the whole archive. Resolves names to { read() -> Promise<Uint8Array> }.
export function openZip(u8) {
  const dv = view(u8);
  // The end-of-central-directory record sits in the last 64 KB (its comment can push it back).
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let o = dv.getUint32(eocd + 16, true);
  const names = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count && o + 46 <= u8.length; n++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const method = dv.getUint16(o + 10, true);
    const csize = dv.getUint32(o + 20, true);
    const nameLen = dv.getUint16(o + 28, true);
    const extraLen = dv.getUint16(o + 30, true);
    const commentLen = dv.getUint16(o + 32, true);
    const local = dv.getUint32(o + 42, true);
    const name = names.decode(u8.subarray(o + 46, o + 46 + nameLen));
    entries.set(name, { method, csize, local });
    o += 46 + nameLen + extraLen + commentLen;
  }

  async function read(name) {
    const e = entries.get(name);
    if (!e) return null;
    // The local header repeats the name and has its own extra field, so the data starts after both.
    const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const raw = u8.subarray(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new Error(`Unsupported zip method ${e.method}`);
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    read,
    text: async (name) => { const b = await read(name); return b && new TextDecoder().decode(b); },
  };
}
