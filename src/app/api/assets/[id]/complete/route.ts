import { isSignedIn } from "@/lib/auth";
import { finishUpload } from "@/lib/media/assets";

/** Step 2 of a cloud upload: the browser has PUT the file (and maybe a thumbnail) to storage. */
export async function POST(req: Request, ctx: RouteContext<"/api/assets/[id]/complete">) {
  if (!(await isSignedIn())) return Response.json({ error: "Signed out. Reload and sign in." }, { status: 401 });
  try {
    const meta = await req.json().catch(() => ({}));
    return Response.json(await finishUpload((await ctx.params).id, meta));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
