import { guard } from "@/lib/tools/http";
import { getJob, removeJob } from "@/lib/tools/media";

export async function GET(_req: Request, ctx: RouteContext<"/api/tools/media/jobs/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const job = getJob((await ctx.params).id);
  return job ? Response.json(job) : Response.json({ error: "Not found." }, { status: 404 });
}

/** Cancels a running download, or clears a finished one and deletes its file. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/tools/media/jobs/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  return removeJob((await ctx.params).id) ? new Response(null, { status: 204 }) : Response.json({ error: "Not found." }, { status: 404 });
}
