// Image compressor (sharp/libvips): re-encode at a quality, or search for the best quality that fits
// a target size. Optionally resizes and converts (JPG / WebP / AVIF / PNG). HEIC is decoded with
// macOS's own `sips` when sharp can't read it.
import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { WORK_DIR, run } from "./bin";
import { ToolError } from "./media";
import { IMAGE_FORMATS, IMAGE_MAX_SIDES, type ImageFormat } from "./shared";

export interface ImageOptions {
  format: ImageFormat;
  mode: "quality" | "size";
  quality: number; // 1–100
  targetKB: number;
  maxSide: number | null;
  keepMeta: boolean;
}

export interface ImageResult {
  data: Buffer;
  format: "jpeg" | "png" | "webp" | "avif" | "gif";
  width: number;
  height: number;
  quality: number | null; // what was used (size mode finds it)
  keptOriginal: boolean;
  note: string | null;
}

export function parseImageOptions(form: FormData): ImageOptions {
  const fmt = String(form.get("format") ?? "same");
  const q = Number(form.get("quality"));
  const kb = Number(form.get("targetKB"));
  const side = Number(form.get("maxSide"));
  return {
    format: (IMAGE_FORMATS as readonly string[]).includes(fmt) ? (fmt as ImageFormat) : "same",
    mode: form.get("mode") === "size" ? "size" : "quality",
    quality: Number.isFinite(q) ? Math.max(1, Math.min(100, Math.round(q))) : 75,
    targetKB: Number.isFinite(kb) && kb >= 10 ? Math.min(kb, 100_000) : 500,
    maxSide: (IMAGE_MAX_SIDES as readonly number[]).includes(side) ? side : null,
    keepMeta: form.get("keepMeta") === "1",
  };
}

type OutFormat = ImageResult["format"];
const SAME: Record<string, OutFormat> = { jpeg: "jpeg", jpg: "jpeg", png: "png", webp: "webp", avif: "avif", gif: "gif" };

let queue: Promise<unknown> = Promise.resolve();
/** One image at a time: AVIF and big PNGs are CPU- and memory-hungry. */
export function compressImage(input: Buffer, opts: ImageOptions): Promise<ImageResult> {
  const task = queue.then(() => work(input, opts));
  queue = task.catch(() => undefined);
  return task;
}

async function readable(input: Buffer): Promise<{ buf: Buffer; meta: Metadata; fromHeic: boolean }> {
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    if (meta.format === "heif" && meta.compression === "hevc") throw new Error("hevc heif");
    // Make sure the pixels actually decode (some HEIF variants pass metadata() but fail later).
    await sharp(input, { failOn: "none" }).resize(8, 8).raw().toBuffer();
    return { buf: input, meta, fromHeic: false };
  } catch {
    const buf = await heicViaSips(input);
    return { buf, meta: await sharp(buf).metadata(), fromHeic: true };
  }
}

/** iPhone photos (HEIC): sharp's prebuilt binaries can't decode them, but every Mac can via `sips`. */
async function heicViaSips(input: Buffer): Promise<Buffer> {
  if (process.platform !== "darwin") {
    throw new ToolError("Can't read that image. HEIC (iPhone) photos only work when the hub runs on the Mac; otherwise use JPG, PNG, WebP, AVIF, GIF or TIFF.");
  }
  const dir = path.join(WORK_DIR, `img-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const src = path.join(dir, "in.heic"), dst = path.join(dir, "out.png");
    fs.writeFileSync(src, input);
    const r = await run("/usr/bin/sips", ["-s", "format", "png", src, "--out", dst], { timeoutMs: 60_000 });
    if (r.code !== 0 || !fs.existsSync(dst)) throw new ToolError("Can't read that image. Use JPG, PNG, WebP, AVIF, GIF, TIFF or HEIC.");
    return fs.readFileSync(dst);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function work(input: Buffer, o: ImageOptions): Promise<ImageResult> {
  const { buf, meta, fromHeic } = await readable(input);
  const animated = (meta.pages ?? 1) > 1 && meta.format === "gif";
  const inFormat = SAME[meta.format ?? ""] ?? null;
  // "Same format" keeps JPG/PNG/WebP/AVIF/GIF; anything else (HEIC, TIFF…) becomes JPG.
  let format: OutFormat = o.format === "same" ? (inFormat ?? "jpeg") : o.format;
  if (animated && format !== "gif" && format !== "webp") format = "webp"; // keep the animation
  const W = meta.autoOrient?.width ?? meta.width ?? 0;
  const H = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!W || !H) throw new ToolError("Can't read that image's size.");
  if (W * H > 268_000_000) throw new ToolError("That image is too large (over 268 megapixels).");

  const longSide = Math.max(W, H);
  const build = (side: number | null) => {
    let s = sharp(buf, { failOn: "none", animated, limitInputPixels: false }).rotate();
    if (side && side < longSide) s = s.resize({ width: side, height: side, fit: "inside", withoutEnlargement: true });
    if (o.keepMeta) s = s.keepExif().keepIccProfile();
    return s;
  };
  const encode = async (side: number | null, q: number) => {
    const s = build(side);
    const lossless = q >= 100;
    switch (format) {
      case "jpeg": s.jpeg({ quality: Math.min(q, 100), mozjpeg: true }); break;
      case "webp": s.webp(lossless ? { lossless: true, effort: 5 } : { quality: q, effort: 5, smartSubsample: true }); break;
      case "avif": s.avif(lossless ? { lossless: true, effort: 4 } : { quality: q, effort: 4 }); break;
      case "png": s.png(lossless ? { compressionLevel: 9, effort: 7 } : { palette: true, quality: q, compressionLevel: 9, effort: 7 }); break;
      case "gif": s.gif({ colours: Math.max(16, Math.round((q / 100) * 256)), effort: 7, dither: 0.6 }); break;
    }
    const { data, info } = await s.toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: animated ? (info.pageHeight ?? info.height) : info.height };
  };

  let side = o.maxSide && o.maxSide < longSide ? o.maxSide : null;
  let note: string | null = fromHeic ? "Converted from HEIC." : null;
  let quality: number | null = o.quality;
  let out;

  if (o.mode === "quality") {
    out = await encode(side, o.quality);
  } else {
    const target = o.targetKB * 1000;
    type Enc = Awaited<ReturnType<typeof encode>>;
    // Try the lowest quality first: if even that is too big, shrink (scaled from how far off it was)
    // instead of wasting a full search. Otherwise binary-search the highest quality that fits.
    const fit = async (sd: number | null): Promise<{ q: number; r: Enc } | { tooBig: number }> => {
      const floor = await encode(sd, 10);
      if (floor.data.length > target) return { tooBig: floor.data.length };
      let best = { q: 10, r: floor };
      let lo = 11, hi = 95;
      while (hi - lo >= 2) {
        const mid = Math.round((lo + hi) / 2);
        const r = await encode(sd, mid);
        if (r.data.length <= target) { best = { q: mid, r }; lo = mid + 1; } else hi = mid - 1;
      }
      return best;
    };
    let res = await fit(side);
    let shrinks = 0;
    while ("tooBig" in res && shrinks < 5) {
      const cur = side ?? longSide;
      if (cur <= 320) break;
      side = Math.max(320, Math.floor(cur * Math.min(0.9, Math.sqrt(target / res.tooBig) * 0.95)));
      shrinks++;
      res = await fit(side);
    }
    if (!("tooBig" in res)) {
      out = res.r;
      quality = res.q;
      if (shrinks) note = [note, `Resized to ${Math.max(out.width, out.height)} px to fit ${o.targetKB} KB.`].filter(Boolean).join(" ");
    } else {
      out = await encode(side, 10);
      quality = 10;
      note = [note, `Couldn't get under ${o.targetKB} KB — this is the smallest it goes.`].filter(Boolean).join(" ");
    }
  }

  // Same format, same size, and we only made it bigger → hand back the original untouched.
  const sameShape = !side && !fromHeic && format === inFormat;
  if (sameShape && out.data.length >= input.length) {
    return { data: input, format, width: W, height: H, quality: null, keptOriginal: true, note: "Already well compressed — this is your original file." };
  }
  return { data: out.data, format, width: out.width, height: out.height, quality: format === "gif" ? null : quality, keptOriginal: false, note };
}
