import fs from "node:fs";
import { Readable } from "node:stream";
import { attachment, guard } from "@/lib/tools/http";
import { compressJobFile } from "@/lib/tools/compress-video";

export async function GET(_req: Request, ctx: RouteContext<"/api/tools/compress/video/[id]/file">) {
  const denied = await guard();
  if (denied) return denied;
  const file = compressJobFile((await ctx.params).id, "output");
  if (!file) return Response.json({ error: "Not ready or already cleared." }, { status: 404 });
  const { size } = fs.statSync(file.path);
  const body = Readable.toWeb(fs.createReadStream(file.path)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": attachment(file.name),
      "Cache-Control": "no-store",
    },
  });
}
