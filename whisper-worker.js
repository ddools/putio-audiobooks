// Runs Whisper off the main thread, so playback and scrolling never stall on it.
// Messages in: { id, type: 'load' } or { id, type: 'run', audio: Float32Array at 16 kHz, lang }.
// Messages out: { id, progress } while the model downloads, then { id, result } or { id, error }.
import { env, pipeline } from './vendor/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;

const MODEL = 'Xenova/whisper-tiny';
let asr = null;

self.onmessage = async ({ data }) => {
  const { id } = data;
  try {
    asr ||= pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => { if (p.status === 'progress') self.postMessage({ id, progress: { file: p.file, loaded: p.loaded, total: p.total } }); },
    });
    const run = await asr;
    if (data.type === 'load') return self.postMessage({ id, result: true });
    const out = await run(data.audio, { task: 'transcribe', return_timestamps: true, ...(data.lang && { language: data.lang }) });
    self.postMessage({ id, result: out.chunks?.length ? out.chunks : [{ text: out.text, timestamp: [0, data.audio.length / 16000] }] });
  } catch (err) {
    asr = null; // a failed download can be tried again
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
