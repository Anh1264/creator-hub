import { fail, guard } from "@/lib/tools/http";
import { createCompressJob, listCompressJobs, parseVideoOptions, videoCodecs } from "@/lib/tools/compress-video";

/** The job list plus which encoders this computer's ffmpeg has. */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return Response.json({ jobs: listCompressJobs(), codecs: await videoCodecs() });
}

/** Raw video in the body (streamed to disk), file name in X-File-Name, options in the query string. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    if (!req.body) return Response.json({ error: "No file received." }, { status: 400 });
    const name = decodeURIComponent(req.headers.get("x-file-name") ?? "video.mp4");
    return Response.json(await createCompressJob(req.body, name, parseVideoOptions(new URL(req.url).searchParams)), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
