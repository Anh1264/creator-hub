import { guard } from "@/lib/tools/http";
import { getTranscript, removeTranscript } from "@/lib/tools/transcribe";

export async function GET(_req: Request, ctx: RouteContext<"/api/tools/transcribe/jobs/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const job = getTranscript((await ctx.params).id);
  return job ? Response.json(job) : Response.json({ error: "Not found." }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/tools/transcribe/jobs/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  return removeTranscript((await ctx.params).id) ? new Response(null, { status: 204 }) : Response.json({ error: "Not found." }, { status: 404 });
}
