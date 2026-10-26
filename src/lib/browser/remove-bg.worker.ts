/// <reference lib="webworker" />
// Background removal in the browser (used on the hosted site; on your own computer the server does it).
// Model: ormbg (Apache-2.0, ISNet architecture), int8-quantized ONNX, ~44 MB, downloaded once from
// Hugging Face and kept in the browser's Cache Storage. Runs on onnxruntime-web (WebAssembly).
import * as ort from "onnxruntime-web/wasm";

export const MODEL_URL = "https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx";
const MODEL_BYTES = 44_300_000; // fallback for the progress bar when the CDN doesn't send a length
const SIZE = 1024;
const CACHE = "hub-models-v1";

ort.env.wasm.wasmPaths = "/api/vendor/ort/";
ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which the app doesn't use

export type RemoveBgRequest = { id: number; file: Blob; modelUrl?: string };
export type RemoveBgReply =
  | { id: number; type: "progress"; loaded: number; total: number }
  | { id: number; type: "done"; blob: Blob; ms: number; width: number; height: number }
  | { id: number; type: "error"; message: string };

const post = (m: RemoveBgReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
let session: Promise<ort.InferenceSession> | null = null;

async function download(url: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download the AI model (${res.status}). Check your connection and try again.`);
  const total = Number(res.headers.get("content-length")) || MODEL_BYTES;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (loaded - last > 400_000) { last = loaded; onProgress(loaded, total); }
  }
  const blob = new Blob(parts as BlobPart[]);
  await cache?.put(url, new Response(blob)).catch(() => {}); // storage full / private mode: just don't cache
  return blob.arrayBuffer();
}

function loadSession(url: string, onProgress: (loaded: number, total: number) => void) {
  session ??= download(url, onProgress)
    .then((buf) => ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }))
    .catch((e) => { session = null; throw e; });
  return session;
}

async function cutOut(id: number, file: Blob, url: string) {
  const t0 = performance.now();
  const s = await loadSession(url, (loaded, total) => post({ id, type: "progress", loaded, total }));
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that image. Try a JPG, PNG or WebP (HEIC works in Safari only).");
  }
  const W = bmp.width, H = bmp.height;

  // model input: 1024×1024 RGB in 0..1 (ormbg doesn't normalise further)
  const inC = new OffscreenCanvas(SIZE, SIZE);
  const inX = inC.getContext("2d", { willReadFrequently: true })!;
  inX.imageSmoothingQuality = "high";
  inX.drawImage(bmp, 0, 0, SIZE, SIZE);
  const px = inX.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = px[i * 4] / 255;
    input[plane + i] = px[i * 4 + 1] / 255;
    input[2 * plane + i] = px[i * 4 + 2] / 255;
  }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const raw = out[s.outputNames[0]].data as Float32Array;

  // probabilities → 0..1 (apply sigmoid only if the export left logits), then stretch min..max like ISNet does
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < plane; i++) { const v = raw[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const logits = mn < -0.01 || mx > 1.01;
  if (logits) { mn = 1 / (1 + Math.exp(-mn)); mx = 1 / (1 + Math.exp(-mx)); }
  const span = mx - mn || 1;
  const mask = new ImageData(SIZE, SIZE);
  for (let i = 0; i < plane; i++) {
    const p = logits ? 1 / (1 + Math.exp(-raw[i])) : raw[i];
    mask.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(((p - mn) / span) * 255)));
  }

  // scale the mask back up to the photo and use it as the alpha channel
  const mC = new OffscreenCanvas(SIZE, SIZE);
  mC.getContext("2d")!.putImageData(mask, 0, 0);
  const big = new OffscreenCanvas(W, H);
  const bx = big.getContext("2d", { willReadFrequently: true })!;
  bx.imageSmoothingQuality = "high";
  bx.drawImage(mC, 0, 0, W, H);
  const alpha = bx.getImageData(0, 0, W, H).data;
  bx.clearRect(0, 0, W, H);
  bx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = bx.getImageData(0, 0, W, H);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.min(img.data[i], alpha[i]);
  bx.putImageData(img, 0, 0);
  const blob = await big.convertToBlob({ type: "image/png" });
  post({ id, type: "done", blob, ms: Math.round(performance.now() - t0), width: W, height: H });
}

self.onmessage = (e: MessageEvent<RemoveBgRequest>) => {
  const { id, file, modelUrl } = e.data;
  cutOut(id, file, modelUrl ?? MODEL_URL).catch((err: unknown) => {
    post({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  });
};
