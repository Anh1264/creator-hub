import fs from "node:fs/promises";
import path from "node:path";

// Serves the WebAssembly runtime for the in-browser tools (onnxruntime-web for Remove background) straight
// from node_modules, so it always matches the installed version and doesn't depend on a third-party CDN.
// Open-source library files only: nothing user-specific, so no sign-in check.
const FILES: Record<string, string> = {
  "ort/ort-wasm-simd-threaded.mjs": "onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  "ort/ort-wasm-simd-threaded.wasm": "onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
};
const TYPES: Record<string, string> = { ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm" };

export async function GET(_req: Request, ctx: RouteContext<"/api/vendor/[...path]">) {
  const rel = (await ctx.params).path.join("/");
  const file = FILES[rel];
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const body = await fs.readFile(path.join(process.cwd(), "node_modules", file));
    return new Response(body, { headers: { "Content-Type": TYPES[path.extname(rel)], "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
