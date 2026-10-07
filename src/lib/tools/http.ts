import "server-only";
import { isSignedIn } from "../auth";
import { IS_HOSTED } from "./bin";
import { ToolError } from "./media";

/** Every tools endpoint: signed-in only, and only on your own computer (not on Vercel). */
export async function guard(): Promise<Response | null> {
  if (!(await isSignedIn())) return Response.json({ error: "Signed out. Reload the page and sign in." }, { status: 401 });
  if (IS_HOSTED) return Response.json({ error: "The tools run on your own computer. Start the hub locally with `npm run dev`." }, { status: 501 });
  return null;
}

export function fail(e: unknown) {
  if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
  console.error("[tools]", e);
  return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
}

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", opus: "audio/ogg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm", png: "image/png",
};
export const contentType = (name: string) => TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** attachment; filename="ascii fallback"; filename*=UTF-8''… so Vietnamese titles survive. */
export function attachment(name: string) {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "").trim() || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
