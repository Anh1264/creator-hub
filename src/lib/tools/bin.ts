// Finds the command-line programs the media tools need (yt-dlp, ffmpeg, ffprobe) and runs them.
// Everything the tools write lives in `<project>/.tools/` (git-ignored), never elsewhere on disk.
import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const TOOLS_DIR = path.join(process.cwd(), ".tools");
export const BIN_DIR = path.join(TOOLS_DIR, "bin");
export const FF_DIR = path.join(TOOLS_DIR, "ffmpeg");
export const WORK_DIR = path.join(TOOLS_DIR, "work");
export const CACHE_DIR = path.join(TOOLS_DIR, "cache");

/** On Vercel there's no yt-dlp and no disk to work in — the media tools only run on your own computer. */
export const IS_HOSTED = !!process.env.VERCEL;

const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";

export type BinSource = "env" | "project" | "system";
export interface Bin { path: string; source: BinSource }

const isFile = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Like `which`: first match on PATH (honours PATHEXT on Windows). */
function which(cmd: string): string | null {
  const exts = WIN ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      if (isFile(p)) return p;
    }
  }
  return null;
}

function find(envVar: string, projectPaths: string[], cmd: string): Bin | null {
  const fromEnv = process.env[envVar];
  if (fromEnv && isFile(fromEnv)) return { path: fromEnv, source: "env" };
  for (const p of projectPaths) if (isFile(p)) return { path: p, source: "project" };
  const sys = which(cmd);
  return sys ? { path: sys, source: "system" } : null;
}

/** npm installs a prebuilt binary for this OS/CPU under node_modules/@ffmpeg-installer/<platform>-<arch>/. */
const npmBinary = (pkg: "ffmpeg" | "ffprobe") =>
  path.join(process.cwd(), "node_modules", `@${pkg}-installer`, `${process.platform}-${process.arch}`, pkg + EXE);

export const findYtDlp = () => find("YTDLP_PATH", [path.join(BIN_DIR, "yt-dlp" + EXE)], "yt-dlp");
export const findFfmpeg = () => find("FFMPEG_PATH", [npmBinary("ffmpeg")], "ffmpeg");
export const findFfprobe = () => find("FFPROBE_PATH", [npmBinary("ffprobe")], "ffprobe");

/**
 * yt-dlp wants ffmpeg and ffprobe in one folder. The npm packages put them in two, so we link (or,
 * on Windows, copy) both into .tools/ffmpeg once and hand yt-dlp that folder.
 */
export function ffmpegLocation(): string | null {
  const ff = findFfmpeg();
  const fp = findFfprobe();
  if (!ff) return null;
  if (!fp || path.dirname(ff.path) === path.dirname(fp.path)) return path.dirname(ff.path);
  fs.mkdirSync(FF_DIR, { recursive: true });
  for (const [src, name] of [[ff.path, "ffmpeg"], [fp.path, "ffprobe"]] as const) {
    const dst = path.join(FF_DIR, name + EXE);
    try {
      if (fs.realpathSync(dst) === fs.realpathSync(src)) continue;
      if (fs.statSync(dst).size === fs.statSync(src).size) continue;
    } catch { /* missing — create below */ }
    fs.rmSync(dst, { force: true });
    try {
      if (WIN) throw new Error("copy on Windows");
      fs.symlinkSync(src, dst);
    } catch {
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, 0o755);
    }
  }
  return FF_DIR;
}

export interface RunResult { code: number | null; stdout: string; stderr: string }

/** Runs a program with an argument list (never through a shell) and collects its output. */
export function run(cmd: string, args: string[], { timeoutMs = 60_000, cwd }: { timeoutMs?: number; cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(e) }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

// ─── Status ───────────────────────────────────────────────────────────────
export interface BinStatus { ok: boolean; version: string | null; source: BinSource | null; path: string | null }
export interface ToolsStatus { hosted: boolean; ytdlp: BinStatus; ffmpeg: BinStatus; ffprobe: BinStatus }

async function probe(bin: Bin | null, args: string[], parse: (out: string) => string | null): Promise<BinStatus> {
  if (!bin) return { ok: false, version: null, source: null, path: null };
  const r = await run(bin.path, args, { timeoutMs: 30_000 });
  const version = r.code === 0 ? parse(r.stdout) : null;
  return { ok: version !== null, version, source: bin.source, path: bin.path };
}

const g = globalThis as unknown as { __toolsStatus?: { at: number; value: ToolsStatus } };

export async function toolsStatus(fresh = false): Promise<ToolsStatus> {
  const cached = g.__toolsStatus;
  if (!fresh && cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const ffVersion = (out: string) => out.match(/version\s+(\S+)/)?.[1] ?? null;
  const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
    probe(findYtDlp(), ["--version"], (out) => out.trim().split(/\s+/)[0] || null),
    probe(findFfmpeg(), ["-version"], ffVersion),
    probe(findFfprobe(), ["-version"], ffVersion),
  ]);
  const value = { hosted: IS_HOSTED, ytdlp, ffmpeg, ffprobe };
  g.__toolsStatus = { at: Date.now(), value };
  return value;
}

export function clearStatusCache() { g.__toolsStatus = undefined; }
