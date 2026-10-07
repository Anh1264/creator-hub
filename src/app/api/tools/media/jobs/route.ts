import { fail, guard } from "@/lib/tools/http";
import { createJob, listJobs, parseJobOptions } from "@/lib/tools/media";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return Response.json(listJobs());
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(createJob(parseJobOptions(body)), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
