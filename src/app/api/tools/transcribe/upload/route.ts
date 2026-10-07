import { fail, guard } from "@/lib/tools/http";
import { createFileJob, parseOptions } from "@/lib/tools/transcribe";

/** Raw file in the body (streamed to disk), file name in X-File-Name, options in the query string. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    if (!req.body) return Response.json({ error: "No file received." }, { status: 400 });
    const name = decodeURIComponent(req.headers.get("x-file-name") ?? "upload");
    const opts = parseOptions(new URL(req.url).searchParams);
    return Response.json(await createFileJob(req.body, name, opts), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
