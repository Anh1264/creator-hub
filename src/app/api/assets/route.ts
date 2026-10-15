import { isSignedIn } from "@/lib/auth";
import { IS_DEMO } from "@/lib/env";
import { saveUpload } from "@/lib/launch/assets";

/** Raw file body (streamed to disk). Headers: X-File-Name (URI-encoded), Content-Type. */
export async function POST(req: Request) {
  if (!(await isSignedIn())) return Response.json({ error: "Signed out. Reload and sign in." }, { status: 401 });
  if (!IS_DEMO) return Response.json({ error: "Uploads go straight to storage in cloud mode (POST /api/assets/upload)." }, { status: 400 });
  if (!req.body) return Response.json({ error: "No file received." }, { status: 400 });
  try {
    const name = decodeURIComponent(req.headers.get("x-file-name") ?? "file");
    const mime = req.headers.get("x-file-type") || req.headers.get("content-type") || "";
    return Response.json(await saveUpload(req.body, name, mime), { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
