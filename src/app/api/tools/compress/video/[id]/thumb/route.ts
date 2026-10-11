import fs from "node:fs";
import { Readable } from "node:stream";
import { guard } from "@/lib/tools/http";
import { compressJobFile } from "@/lib/tools/compress-video";

export async function GET(_req: Request, ctx: RouteContext<"/api/tools/compress/video/[id]/thumb">) {
  const denied = await guard();
  if (denied) return denied;
  const file = compressJobFile((await ctx.params).id, "thumb");
  if (!file) return Response.json({ error: "Not ready or already cleared." }, { status: 404 });
  const { size } = fs.statSync(file.path);
  const body = Readable.toWeb(fs.createReadStream(file.path)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
