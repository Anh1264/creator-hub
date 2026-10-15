// Canvas helpers for Sign PDF: trimming, turning a photo of a signature into transparent ink,
// rendering typed text, and the signatures saved in this browser.
import { INK, TEXT_BASELINE, TEXT_FONT, TEXT_LINE, type Ink, type SavedMark } from "@/lib/pdf/sign";

export type Png = { src: string; w: number; h: number };

/** Crops a canvas to its non-transparent pixels (plus padding) and returns a PNG. Null when empty. */
export function trimToPng(canvas: HTMLCanvasElement, pad = 6, maxH = 360): Png | null {
  const ctx = canvas.getContext("2d")!;
  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.min(1, maxH / h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  const o = out.getContext("2d")!;
  o.imageSmoothingQuality = "high";
  o.drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
  return { src: out.toDataURL("image/png"), w: out.width, h: out.height };
}

/**
 * A photo/scan of a signature on paper → ink on a transparent background. The paper's brightness
 * is estimated from the image itself, so shadows and off-white paper drop out too.
 */
export async function photoToInk(file: File, ink: Ink): Promise<Png | null> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const lum = new Float32Array(d.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) {
    // already-transparent pixels (a PNG cut-out) count as paper
    const a = d[i * 4 + 3] / 255;
    const l = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a + 255 * (1 - a);
    lum[i] = l;
    hist[Math.min(255, Math.round(l))]++;
  }
  // paper = the 60th percentile brightness (most of the picture is paper)
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lum.length * 0.6) { paper = v; break; } }
  const hi = paper * 0.82, lo = paper * 0.45;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(INK[ink].slice(i, i + 2), 16));
  for (let i = 0; i < lum.length; i++) {
    const a = Math.max(0, Math.min(1, (hi - lum[i]) / (hi - lo)));
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return trimToPng(c, 8);
}

/** Renders a typed signature in a handwriting font. */
export async function typedToInk(text: string, fontFamily: string, ink: Ink): Promise<Png | null> {
  const px = 140;
  const font = `${px}px ${fontFamily}`;
  try { await document.fonts.load(font, text); } catch { /* fall back to whatever is loaded */ }
  const c = document.createElement("canvas");
  const m = c.getContext("2d")!;
  m.font = font;
  c.width = Math.ceil(m.measureText(text).width + px * 1.2);
  c.height = Math.ceil(px * 2);
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = INK[ink];
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, px * 0.6, px * 1.3);
  return trimToPng(c, 6, 300);
}

/** Text item → PNG, used in the export only when the PDF's built-in font can't write some characters. */
export function textToPng(text: string, sizePt: number, ink: Ink, widthPt: number): string {
  const k = 6; // 6× = 432 dpi
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(widthPt * k));
  c.height = Math.max(1, Math.ceil(sizePt * TEXT_LINE * k));
  const ctx = c.getContext("2d")!;
  ctx.font = `${sizePt * k}px ${TEXT_FONT}`;
  ctx.fillStyle = INK[ink];
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 0, sizePt * TEXT_BASELINE * k);
  return c.toDataURL("image/png");
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width in points of a single line of text at `sizePt`, in the same font the export uses. */
export function textWidth(text: string, sizePt: number) {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `${sizePt}px ${TEXT_FONT}`;
  return Math.max(sizePt * 0.6, measureCtx.measureText(text || " ").width);
}

/** The PDF's built-in Helvetica can only write WinAnsi characters (Latin-1 plus a few). */
export const winAnsi = (s: string) => /^[\x20-\x7E -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/.test(s);

// ─── Saved signatures (this browser only; shared between open tabs) ──────────
const KEY = "hub.sign.marks.v1";
const EMPTY: SavedMark[] = [];
let cache: SavedMark[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedMark[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedMark[]; } catch { return EMPTY; }
}

/** For useSyncExternalStore. `set` returns false when the browser refused to store it (full / blocked). */
export const marksStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; fn(); } };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
  },
  get: () => (cache ??= read()),
  server: () => EMPTY,
  set(next: SavedMark[]) {
    cache = next;
    let ok = true;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { ok = false; }
    listeners.forEach((fn) => fn());
    return ok;
  },
};
