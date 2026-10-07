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
};

export default nextConfig;
