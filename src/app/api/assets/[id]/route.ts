import fs from "node:fs";
import { Readable } from "node:stream";
import { isSignedIn } from "@/lib/auth";
import { assetPath, getAsset, thumbPath } from "@/lib/launch/assets";
import { assetRedirect } from "@/lib/media/assets";
import { attachment } from "@/lib/tools/http";

/** Serves a stored file. ?thumb=1 → preview image, ?download=1 → save-as. Supports Range (video seeking). */
export async function GET(req: Request, ctx: RouteContext<"/api/assets/[id]">) {
  if (!(await isSignedIn())) return new Response("Signed out", { status: 401 });
  const id = (await ctx.params).id;
  const sp = new URL(req.url).searchParams;
  // Cloud mode: send the browser to a short-lived signed storage link (it handles Range requests for video seeking).
  const cloud = await assetRedirect(id, { thumb: sp.has("thumb"), download: sp.has("download") });
  if (cloud === "missing") return new Response("Not found", { status: 404 });
  if (cloud) return new Response(null, { status: 302, headers: { Location: cloud, "Cache-Control": "private, max-age=300" } });
  const asset = getAsset(id);
  if (!asset) return new Response("Not found", { status: 404 });
  const thumb = sp.has("thumb") && asset.hasThumb;
  const file = thumb ? thumbPath(asset.id) : assetPath(asset);
  let size: number;
  try { size = fs.statSync(file).size; } catch { return new Response("File missing", { status: 404 }); }
  const headers: Record<string, string> = {
    "Content-Type": thumb ? "image/jpeg" : asset.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (sp.has("download")) headers["Content-Disposition"] = attachment(asset.name);

  const range = !thumb && req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    let start = range[1] ? Number(range[1]) : NaN;
    let end = range[2] ? Number(range[2]) : size - 1;
    if (Number.isNaN(start)) { start = Math.max(0, size - end); end = size - 1; } // "bytes=-500" = last 500
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
