import { guard } from "@/lib/tools/http";
import { removeCompressJob } from "@/lib/tools/compress-video";

/** Cancels a running compression, or clears a finished one and deletes its file. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/tools/compress/video/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  return removeCompressJob((await ctx.params).id) ? new Response(null, { status: 204 }) : Response.json({ error: "Not found." }, { status: 404 });
}
