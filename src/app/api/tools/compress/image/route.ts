import { fail, guard } from "@/lib/tools/http";
import { compressImage, parseImageOptions } from "@/lib/tools/compress-image";

export const maxDuration = 300;
const MAX_BYTES = 80 * 1024 * 1024;
const TYPES = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" } as const;

/** multipart/form-data: `file` + options (see parseImageOptions) → the compressed image, with stats in X-* headers. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No image received." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Images up to 80 MB, please." }, { status: 413 });
    const started = Date.now();
    const r = await compressImage(Buffer.from(await file.arrayBuffer()), parseImageOptions(form));
    return new Response(new Uint8Array(r.data), {
      headers: {
        "Content-Type": TYPES[r.format],
        "Cache-Control": "no-store",
        "X-Format": r.format,
        "X-Image-Size": `${r.width}x${r.height}`,
        "X-Quality": r.quality == null ? "" : String(r.quality),
        "X-Kept-Original": r.keptOriginal ? "1" : "0",
        "X-Note": r.note ? encodeURIComponent(r.note) : "",
        "X-Took-Ms": String(Date.now() - started),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
