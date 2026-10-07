#!/usr/bin/env node
// Downloads the official standalone yt-dlp build for this OS into ./.tools/bin (checksum-verified),
// and links ffmpeg + ffprobe (installed by npm) into ./.tools/ffmpeg. Touches nothing outside this folder.
//
//   npm run tools:setup     install yt-dlp if it's missing (also runs after `npm install`)
//   npm run tools:update    get the newest yt-dlp (do this when YouTube downloads start failing)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, ".tools");
const BIN = path.join(TOOLS, "bin");
const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";
const TARGET = path.join(BIN, "yt-dlp" + EXE);
const RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";

const args = new Set(process.argv.slice(2));
const postinstall = args.has("--postinstall");
const update = args.has("--update");
const log = (m) => console.log(`[tools] ${m}`);

function asset() {
  const { platform: p, arch: a } = process;
  if (p === "darwin") return "yt-dlp_macos"; // universal (Apple Silicon + Intel)
  if (p === "win32") return a === "arm64" ? "yt-dlp_arm64.exe" : a === "ia32" ? "yt-dlp_x86.exe" : "yt-dlp.exe";
  if (p === "linux") return a === "arm64" ? "yt-dlp_linux_aarch64" : a === "arm" ? "yt-dlp_linux_armv7l" : "yt-dlp_linux";
  return null;
}

/** fetch, falling back to curl (which honours proxy settings that Node's fetch ignores). */
async function download(url, dest) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    try {
      execFileSync(WIN ? "curl.exe" : "curl", ["-fsSL", "--retry", "2", "-o", dest, url], { stdio: "ignore" });
    } catch {
      throw new Error(`couldn't download ${url} (${e.message})`);
    }
  }
}

function linkFfmpeg() {
  const pick = (pkg) => path.join(ROOT, "node_modules", `@${pkg}-installer`, `${process.platform}-${process.arch}`, pkg + EXE);
  const dir = path.join(TOOLS, "ffmpeg");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const src = pick(name);
    if (!fs.existsSync(src)) { log(`${name} from npm not found for ${process.platform}-${process.arch}; will use one on PATH if available.`); continue; }
    const dst = path.join(dir, name + EXE);
    fs.rmSync(dst, { force: true });
    try {
      if (WIN) throw new Error("copy");
      fs.symlinkSync(src, dst);
    } catch {
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, 0o755);
    }
  }
}

async function installYtDlp() {
  const name = asset();
  if (!name) { log(`no yt-dlp build for ${process.platform}-${process.arch}; install it yourself and set YTDLP_PATH.`); return; }
  fs.mkdirSync(BIN, { recursive: true });
  const tmp = TARGET + ".download";
  log(`downloading ${name}…`);
  await download(RELEASE + name, tmp);
  const sums = path.join(BIN, "SHA2-256SUMS");
  await download(RELEASE + "SHA2-256SUMS", sums);
  const expected = fs.readFileSync(sums, "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find(([, f]) => f === name)?.[0];
  const actual = createHash("sha256").update(fs.readFileSync(tmp)).digest("hex");
  fs.rmSync(sums, { force: true });
  if (!expected || expected.toLowerCase() !== actual) {
    fs.rmSync(tmp, { force: true });
    throw new Error("checksum mismatch — download discarded");
  }
  fs.renameSync(tmp, TARGET);
  if (!WIN) fs.chmodSync(TARGET, 0o755);
  log(`yt-dlp ${version()} installed → ${path.relative(ROOT, TARGET)}`);
}

function version() {
  try { return execFileSync(TARGET, ["--version"], { encoding: "utf8" }).trim(); } catch { return "?"; }
}

async function main() {
  if (postinstall && (process.env.VERCEL || process.env.CI)) return; // hosted builds don't run the tools
  linkFfmpeg();
  if (!fs.existsSync(TARGET)) await installYtDlp();
  else if (update) {
    log(`updating yt-dlp ${version()}…`);
    try {
      execFileSync(TARGET, ["-U"], { stdio: "inherit" });
    } catch {
      await installYtDlp(); // e.g. self-update blocked — just fetch a fresh copy
    }
    log(`yt-dlp is now ${version()}`);
  } else log(`yt-dlp ${version()} already installed (npm run tools:update to update)`);
}

main().catch((e) => {
  log(`setup failed: ${e.message}`);
  if (postinstall) {
    log("npm install still succeeded — run `npm run tools:setup` later to finish the tools setup.");
    process.exit(0);
  }
  process.exit(1);
});
