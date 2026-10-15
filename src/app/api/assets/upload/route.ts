import { currentUser } from "@/lib/auth";
import { IS_DEMO } from "@/lib/env";
import { startUpload } from "@/lib/media/assets";

/**
 * Step 1 of an upload. Local mode → { mode: "local" } (the browser then streams the file to POST /api/assets).
 * Cloud mode → signed storage URLs (Supabase Storage or R2) for the file and its thumbnail; finish with POST /api/assets/<id>/complete.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Signed out. Reload and sign in." }, { status: 401 });
  if (IS_DEMO) return Response.json({ mode: "local" });
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json({ mode: "direct", ...(await startUpload(user, body)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
