// Sign PDF export: stamps the placed items onto the PDF with pdf-lib. Browser-side (also runs in Node
// for tests). Kept apart from sign.ts so pdf-lib only loads when a PDF is opened.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { INK, MARK_PATHS, TEXT_BASELINE, TEXT_LINE, type PageGeom, type Placed } from "./sign";

const hex = (c: string) => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);

function inverse([a, b, c, d, e, f]: number[]) {
  const det = a * d - b * c;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return {
    point: (X: number, Y: number) => ({ x: ia * (X - e) + ic * (Y - f), y: ib * (X - e) + id * (Y - f) }),
    // angle of the visual "right" direction in PDF space: how much to rotate drawings so they look upright
    angle: Math.round((Math.atan2(ib, ia) * 180) / Math.PI),
  };
}

function dataUrlBytes(src: string) {
  const b64 = src.slice(src.indexOf(",") + 1);
  if (typeof atob === "function") return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export class LockedPdfError extends Error {}

/** Opens the PDF with pdf-lib (to fail early on encrypted files). */
export async function openForSigning(bytes: Uint8Array) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if ((e as Error).name === "EncryptedPDFError" || /encrypt/i.test((e as Error).message)) {
      throw new LockedPdfError("This PDF is locked (encrypted), so it can't be changed. Make an unlocked copy first: open it, choose Print → Save as PDF, then sign that copy.");
    }
    throw e;
  }
}

/** Stamps every placed item onto the PDF and returns the new file. The rest of the file is kept as is. */
export async function stampPdf(bytes: Uint8Array, items: Placed[], geoms: PageGeom[]): Promise<Uint8Array> {
  const doc = await openForSigning(bytes);
  const pages = doc.getPages();
  const images = new Map<string, Promise<PDFImage>>();
  const image = (src: string) => {
    if (!images.has(src)) images.set(src, doc.embedPng(dataUrlBytes(src)));
    return images.get(src)!;
  };
  let helvetica: PDFFont | null = null;

  for (const it of items) {
    const page: PDFPage | undefined = pages[it.page];
    const g = geoms[it.page];
    if (!page || !g) continue;
    const inv = inverse(g.transform);
    const rot = degrees(inv.angle);
    const left = it.x * g.width, top = it.y * g.height, w = it.w * g.width, h = it.h * g.height;

    if (it.type === "image") {
      const at = inv.point(left, top + h); // images grow up from their bottom-left corner
      page.drawImage(await image(it.src), { x: at.x, y: at.y, width: w, height: h, rotate: rot });
    } else if (it.type === "mark") {
      const at = inv.point(left, top); // SVG paths grow down from their top-left corner
      const scale = w / 24;
      page.drawSvgPath(MARK_PATHS[it.mark], it.mark === "dot"
        ? { x: at.x, y: at.y, scale, rotate: rot, color: hex(INK[it.ink]) }
        : { x: at.x, y: at.y, scale, rotate: rot, borderColor: hex(INK[it.ink]), borderWidth: 2.4, borderLineCap: 1 });
    } else {
      const lines = it.text.split("\n");
      helvetica ??= await doc.embedFont(StandardFonts.Helvetica);
      let encodable = true;
      try { lines.forEach((l) => helvetica!.encodeText(l)); } catch { encodable = false; }
      if (encodable) {
        lines.forEach((line, i) => {
          if (!line) return;
          const at = inv.point(left, top + it.size * (TEXT_BASELINE + i * TEXT_LINE));
          page.drawText(line, { x: at.x, y: at.y, size: it.size, font: helvetica!, color: hex(INK[it.ink]), rotate: rot });
        });
      } else if (it.png) {
        // characters the built-in PDF font can't encode (e.g. Vietnamese, emoji): use the browser's rendering
        const at = inv.point(left, top + h);
        page.drawImage(await image(it.png), { x: at.x, y: at.y, width: w, height: h, rotate: rot });
      }
    }
  }
  return doc.save();
}
