/// <reference lib="webworker" />
// Image compression in the browser (used on the hosted site; on your own computer the server does it with
// sharp). Same encoders as Squoosh: MozJPEG and libwebp compiled to WebAssembly, plus UPNG for PNG
// (lossless, or palette-reduced below quality 100). Metadata (EXIF, location) is always dropped.
// No AVIF here: @jsquash/avif's threaded worker hangs Turbopack builds, and social platforms rarely take AVIF.
import UPNG from "upng-js";
import type { ImageFormat } from "@/lib/tools/shared";

export type CompressSettings = { format: ImageFormat; mode: "quality" | "size"; quality: number; targetKB: number; maxSide: number | null };
export type CompressRequest = { id: number; file: Blob; name: string; settings: CompressSettings };
export type CompressReply =
  | { id: number; type: "done"; blob: Blob; format: string; width: number; height: number; q: number | null; kept: boolean; note: string | null; ms: number }
  | { id: number; type: "error"; message: string };

type Out = "jpeg" | "webp" | "png";
const post = (m: CompressReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function sourceFormat(type: string, name: string): string {
  const t = type.toLowerCase();
  if (t.includes("jpeg") || /\.jpe?g$/i.test(name)) return "jpeg";
  if (t.includes("png") || /\.png$/i.test(name)) return "png";
  if (t.includes("webp") || /\.webp$/i.test(name)) return "webp";
  if (t.includes("avif") || /\.avif$/i.test(name)) return "avif";
  if (t.includes("gif") || /\.gif$/i.test(name)) return "gif";
  if (t.includes("hei") || /\.hei[cf]$/i.test(name)) return "heic";
  return t.split("/")[1] || "other";
}

async function encode(format: Out, img: ImageData, q: number): Promise<ArrayBuffer> {
  switch (format) {
    case "jpeg": {
      const { default: enc } = await import("@jsquash/jpeg/encode");
      return enc(img, { quality: q });
    }
    case "webp": {
      const { default: enc } = await import("@jsquash/webp/encode");
      return enc(img, { quality: q, method: 4 });
    }
    case "png": {
      // q 100 = lossless; below that, fewer palette colours (256 at q≈99 down to 16 at q 10)
      const colours = q >= 100 ? 0 : Math.max(16, Math.min(256, Math.round(2 ** (4 + (4 * q) / 100))));
      return UPNG.encode([img.data.buffer as ArrayBuffer], img.width, img.height, colours);
    }
  }
}

function pixels(bmp: ImageBitmap, w: number, h: number, flatten: boolean): ImageData {
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext("2d", { willReadFrequently: true })!;
  if (flatten) { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); } // JPEG has no transparency
  x.imageSmoothingQuality = "high";
  x.drawImage(bmp, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

async function compress({ id, file, name, settings: s }: CompressRequest) {
  const t0 = performance.now();
  const src = sourceFormat(file.type, name);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(src === "heic" ? "HEIC photos only open in Safari. Use Safari, or convert to JPG first." : "This browser can't open that image.");
  }
  const notes: string[] = [];
  const out: Out = s.format !== "same" && s.format !== "avif" ? s.format
    : src === "png" || src === "gif" ? "png" : src === "webp" ? "webp" : "jpeg";
  if (s.format === "same" && src === "avif") notes.push("AVIF saved as JPG (AVIF output is only on your own computer).");
  if (s.format === "same" && src === "gif") notes.push("GIF saved as PNG; animation isn't kept online.");
  if (s.format === "same" && src === "heic") notes.push("HEIC saved as JPG.");

  const origW = bmp.width;
  let w = bmp.width, h = bmp.height;
  if (s.maxSide && Math.max(w, h) > s.maxSide) {
    const k = s.maxSide / Math.max(w, h);
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  }
  const flatten = out === "jpeg";
  let img = pixels(bmp, w, h, flatten);
  let buf: ArrayBuffer;
  let q: number | null;

  if (s.mode === "quality") {
    q = s.quality;
    buf = await encode(out, img, q);
  } else {
    const target = s.targetKB * 1024;
    // lowest quality first; if even that is too big, make the picture smaller until it fits
    q = 10;
    buf = await encode(out, img, q);
    for (let tries = 0; buf.byteLength > target && tries < 5; tries++) {
      const k = Math.sqrt(target / buf.byteLength) * 0.95;
      w = Math.max(16, Math.round(w * k)); h = Math.max(16, Math.round(h * k));
      img = pixels(bmp, w, h, flatten);
      buf = await encode(out, img, q);
    }
    if (buf.byteLength > target) notes.push("Couldn't get it under the target size; this is the smallest version.");
    else {
      // highest quality that still fits
      let lo = 11, hi = 95;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const b = await encode(out, img, mid);
        if (b.byteLength <= target) { buf = b; q = mid; lo = mid + 1; } else hi = mid - 1;
      }
    }
    if (w !== bmp.width || h !== bmp.height) notes.push(`Resized to ${w}×${h} to fit.`);
  }
  bmp.close();

  // same format, same size and it didn't get smaller → hand back the original file
  if (out === src && w === origW && buf.byteLength >= file.size) {
    post({ id, type: "done", blob: file, format: out, width: w, height: h, q: null, kept: true, note: "Already well compressed; kept the original.", ms: Math.round(performance.now() - t0) });
    return;
  }
  const blob = new Blob([buf], { type: `image/${out}` });
  post({ id, type: "done", blob, format: out, width: w, height: h, q: out === "png" && q === 100 ? null : q, kept: false, note: notes.join(" ") || null, ms: Math.round(performance.now() - t0) });
}

self.onmessage = (e: MessageEvent<CompressRequest>) => {
  compress(e.data).catch((err: unknown) => post({ id: e.data.id, type: "error", message: err instanceof Error ? err.message : String(err) }));
};
