// Background removal, fully on this machine: IMG.LY's open model (ISNet) via onnxruntime.
// The model files ship inside the npm package, so nothing is downloaded at run time.
import "server-only";
import sharp from "sharp";

export const BG_MODELS = { fast: "small", best: "medium" } as const;
export type BgQuality = keyof typeof BG_MODELS;

const MAX_SIDE = 6000;
let queue: Promise<unknown> = Promise.resolve();

/** Returns a transparent PNG. Runs one image at a time so big batches don't exhaust memory. */
export function removeBackgroundPng(input: Buffer, quality: BgQuality): Promise<{ png: Buffer; width: number; height: number }> {
  const task = queue.then(() => work(input, quality));
  queue = task.catch(() => undefined);
  return task;
}

async function work(input: Buffer, quality: BgQuality) {
  // Normalise first: honour phone EXIF rotation, cap huge images, and hand the model a plain PNG.
  const normalized = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = normalized.info;

  const { removeBackground } = await import("@imgly/background-removal-node");
  const blob = await removeBackground(new Blob([new Uint8Array(normalized.data)], { type: "image/png" }), {
    model: BG_MODELS[quality],
    output: { format: "image/x-rgba8" }, // raw pixels: we encode a lossless PNG ourselves
  });
  const raw = Buffer.from(await blob.arrayBuffer());
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
  return { png, width, height };
}
