import { isSignedIn } from "@/lib/auth";
import { toolsStatus } from "@/lib/tools/bin";

export async function GET(req: Request) {
  if (!(await isSignedIn())) return Response.json({ error: "Signed out." }, { status: 401 });
  const fresh = new URL(req.url).searchParams.has("fresh");
  return Response.json(await toolsStatus(fresh));
}
