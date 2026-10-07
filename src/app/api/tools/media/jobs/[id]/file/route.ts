import fs from "node:fs";
import { Readable } from "node:stream";
import { attachment, contentType, guard } from "@/lib/tools/http";
import { jobFile } from "@/lib/tools/media";

export async function GET(_req: Request, ctx: RouteContext<"/api/tools/media/jobs/[id]/file">) {
  const denied = await guard();
  if (denied) return denied;
  const file = jobFile((await ctx.params).id);
  if (!file) return Response.json({ error: "File not ready or already cleared." }, { status: 404 });
  const { size } = fs.statSync(file.path);
  const body = Readable.toWeb(fs.createReadStream(file.path)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": contentType(file.name),
      "Content-Length": String(size),
      "Content-Disposition": attachment(file.name),
      "Cache-Control": "no-store",
    },
  });
}
