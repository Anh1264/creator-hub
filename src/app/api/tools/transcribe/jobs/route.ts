import { fail, guard } from "@/lib/tools/http";
import { createLinkJob, listTranscripts, parseOptions } from "@/lib/tools/transcribe";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return Response.json(listTranscripts());
}

/** { url, method, language, model, cookies, title?, thumbnail? } */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(createLinkJob(body.url, parseOptions(body), body), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
