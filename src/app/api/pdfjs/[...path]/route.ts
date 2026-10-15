import fs from "node:fs/promises";
import path from "node:path";

// Serves pdf.js's worker and its support files (character maps for CJK text, the 14 standard fonts,
// image decoders) straight from node_modules, so they always match the installed pdfjs-dist version
// and work offline. Open-source library files only: nothing user-specific, so no sign-in check.
const ROOT = path.join(process.cwd(), "node_modules", "pdfjs-dist");
const ALLOWED = /^(legacy\/build\/pdf\.worker\.min\.mjs|cmaps\/[\w.-]+\.bcmap|standard_fonts\/[\w.-]+\.(pfb|ttf)|wasm\/[\w.-]+\.(wasm|js)|iccs\/[\w.-]+\.icc)$/;
const TYPES: Record<string, string> = {
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm",
  ".ttf": "font/ttf", ".pfb": "application/octet-stream", ".bcmap": "application/octet-stream", ".icc": "application/octet-stream",
};

export async function GET(_req: Request, ctx: RouteContext<"/api/pdfjs/[...path]">) {
  const rel = (await ctx.params).path.join("/");
  if (!ALLOWED.test(rel)) return new Response("Not found", { status: 404 });
  try {
    const body = await fs.readFile(path.join(ROOT, rel));
    return new Response(body, {
      headers: { "Content-Type": TYPES[path.extname(rel)] ?? "application/octet-stream", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
