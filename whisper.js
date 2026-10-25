// On-device speech recognition for finding the exact spot: decodes a clip to 16 kHz mono
// and hands it to Whisper in whisper-worker.js. The model downloads once, on first use.

const READY = 'putio-audiobooks:whisper'; // outside the demo namespace: both share the browser's model cache
const CACHE = 'transformers-cache';       // where transformers.js keeps the model files
// Whisper's own language codes; a book in any other language is left to Whisper to detect.
const LANGS = new Set('en de es fr it nl pt sv da no nb fi pl cs sk hu ro ru uk el tr ar he hi ja ko zh ca gl eu cy ga is et lv lt sl hr sr bg id ms vi th'.split(' '));

export const supported = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
export const ready = () => { try { return localStorage.getItem(READY) === '1'; } catch { return false; } };
export const SIZE = 41e6;     // the model's files, for download progress
export const DOWNLOAD = 63e6; // with the speech engine in vendor/, what it takes on the device

let worker = null;
let seq = 0;
const waiting = new Map();
function send(msg, onProgress, transfer) {
  if (!worker) {
    worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      if (!job) return;
      if (data.progress) {
        job.files[data.progress.file] = data.progress;
        const all = Object.values(job.files);
        job.onProgress?.(Math.min(1, all.reduce((n, f) => n + (f.loaded || 0), 0) / Math.max(SIZE, all.reduce((n, f) => n + (f.total || 0), 0))));
        return;
      }
      waiting.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.result);
    };
    worker.onerror = (e) => {
      for (const job of waiting.values()) job.reject(new Error(e.message || 'Speech recognition failed to start'));
      waiting.clear();
      worker = null;
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onProgress, files: {} });
    worker.postMessage({ id, ...msg }, transfer || []);
  });
}

// Downloads and starts the model. onProgress gets 0 to 1 while it downloads.
export async function prepare(onProgress) {
  await send({ type: 'load' }, onProgress);
  try { localStorage.setItem(READY, '1'); } catch {}
}

// pcm: Float32Array at 16 kHz. Resolves to Whisper's segments, [{ text, timestamp: [from, to] }].
export async function transcribe(pcm, lang, onProgress) {
  const chunks = await send({ type: 'run', audio: pcm, lang: LANGS.has(lang) ? lang : null }, onProgress, [pcm.buffer]);
  try { localStorage.setItem(READY, '1'); } catch {}
  return chunks;
}

export async function forget() {
  worker?.terminate();
  worker = null;
  try { localStorage.removeItem(READY); } catch {}
  for (const name of await caches?.keys() || []) {
    if (name === CACHE || name.startsWith('putio-audiobooks-vendor-')) await caches.delete(name).catch(() => {}); // see sw.js
  }
}

// Encoded audio to 16 kHz mono. An offline context resamples as it decodes, and never touches the
// device's audio session, so the book keeps playing.
export async function pcm16k(bytes, seconds) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let buf;
  try { buf = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(copy); }
  catch { buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
  const n = Math.min(buf.length, Math.ceil(seconds * buf.sampleRate));
  const mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i] / buf.numberOfChannels;
  }
  if (buf.sampleRate === 16000) return mono;
  const ratio = buf.sampleRate / 16000;
  const out = new Float32Array(Math.floor(n / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, k = Math.floor(x), f = x - k;
    out[i] = mono[k] * (1 - f) + (mono[k + 1] ?? mono[k]) * f;
  }
  return out;
}
