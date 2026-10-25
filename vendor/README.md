# Vendored libraries

Speech recognition for "Find the exact spot" in the reader. They load only when that runs, in `whisper-worker.js`.
Served from this site rather than a CDN, so the page's Content-Security-Policy stays `script-src 'self'` and they work offline once cached.

| File | From | License |
| --- | --- | --- |
| `transformers.min.js` | [@huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) 3.8.1, `dist/` (source map comment removed) | Apache-2.0, see `LICENSE-transformers.txt` |
| `ort-wasm-simd-threaded.jsep.mjs`, `ort-wasm-simd-threaded.jsep.wasm` | the same package's `dist/`, built from [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT |

To update, install the new version with npm and copy those three files over. The model itself (`Xenova/whisper-tiny`, about 41 MB) downloads from Hugging Face on first use and is cached by the browser.
