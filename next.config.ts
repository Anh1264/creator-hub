import type { NextConfig } from "next";

// Packages with native binaries / bundled ML models used by the Tools pages. They're loaded from
// node_modules at run time instead of being bundled, and kept out of Vercel's serverless bundles
// (the tools only run on your own computer — see src/lib/tools/bin.ts).
const NATIVE = ["@imgly/background-removal-node", "onnxruntime-node", "@fugood/whisper.node"];

const nextConfig: NextConfig = {
  serverExternalPackages: NATIVE,
  outputFileTracingExcludes: {
    "/api/tools/**": [
      "node_modules/@imgly/**",
      "node_modules/onnxruntime-node/**",
      "node_modules/@ffmpeg-installer/**",
      "node_modules/@ffprobe-installer/**",
      "node_modules/@fugood/**",
      ".tools/**",
    ],
  },
  // Sign PDF runs in the browser; this route hands it pdf.js's worker, fonts and character maps.
  outputFileTracingIncludes: {
    "/api/pdfjs/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "./node_modules/pdfjs-dist/cmaps/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/wasm/**",
      "./node_modules/pdfjs-dist/iccs/**",
    ],
    // Remove background (in the browser) loads its WebAssembly runtime from here.
    "/api/vendor/**": ["./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{mjs,wasm}"],
  },
};

export default nextConfig;
