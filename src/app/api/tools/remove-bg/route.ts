import { fail, guard } from "@/lib/tools/http";
import { BG_MODELS, type BgQuality, removeBackgroundPng } from "@/lib/tools/removebg";

export const maxDuration = 300;
const MAX_BYTES = 30 * 1024 * 1024;

/** multipart/form-data: `file` (image), `quality` ("fast" | "best") → transparent PNG. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No image received." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Images up to 30 MB, please." }, { status: 413 });
    const q = String(form.get("quality") ?? "best");
    const quality: BgQuality = q in BG_MODELS ? (q as BgQuality) : "best";
    const started = Date.now();
    let result;
    try {
      result = await removeBackgroundPng(Buffer.from(await file.arrayBuffer()), quality);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unsupported image format|Input buffer contains unsupported|Input file is missing|heif/i.test(msg)) {
        return Response.json({ error: "Can't read that image. Use JPG, PNG, WebP, GIF, TIFF or AVIF." }, { status: 415 });
      }
      throw e;
    }
    return new Response(new Uint8Array(result.png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Image-Size": `${result.width}x${result.height}`,
        "X-Took-Ms": String(Date.now() - started),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
