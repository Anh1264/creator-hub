// yt-dlp wrapper: look up a link, then download it as an MP3 or a video in the background.
// Jobs live in memory (single user, local server); their files live in .tools/work/<job id>/.
import "server-only";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, WORK_DIR, ffmpegLocation, findYtDlp, run } from "./bin";
import {
  AUDIO_QUALITIES, BROWSERS, type AudioQuality, type Browser, type JobOptions, type MediaInfo, type MediaJob, type VideoMode,
} from "./shared";

export class ToolError extends Error {}

const KEEP_MS = 6 * 60 * 60_000; // finished jobs (and their files) are kept for 6 hours
const MAX_RUNNING = 2;

export function parseUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  let u: URL;
  try { u = new URL(s); } catch { throw new ToolError("That doesn't look like a link. Paste the full URL (https://…)."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ToolError("Only http(s) links are supported.");
  return u.toString();
}

export function ytDlpPath() {
  const bin = findYtDlp();
  if (!bin) throw new ToolError("yt-dlp isn't installed yet. Run `npm run tools:setup` in the project folder, then try again.");
  return bin.path;
}

/** Options shared by every yt-dlp call. */
export async function baseArgs(cookies: Browser | null) {
  const args = ["--ignore-config", "--no-playlist", "--no-color", "--cache-dir", CACHE_DIR];
  // YouTube needs a JavaScript runtime since late 2025; reuse the Node.js that runs this server.
  if (await supportsJsRuntimes()) args.push("--js-runtimes", `node:${process.execPath}`);
  const ff = ffmpegLocation();
  if (ff) args.push("--ffmpeg-location", ff);
  if (cookies) args.push("--cookies-from-browser", cookies);
  return args;
}

const g = globalThis as unknown as {
  __mediaJobs?: Map<string, Internal>;
  __jsRuntimes?: { bin: string; ok: boolean };
};

async function supportsJsRuntimes() {
  const bin = ytDlpPath();
  if (g.__jsRuntimes?.bin === bin) return g.__jsRuntimes.ok;
  const r = await run(bin, ["--help"], { timeoutMs: 30_000 });
  const ok = r.stdout.includes("--js-runtimes");
  g.__jsRuntimes = { bin, ok };
  return ok;
}

export function lastError(stderr: string) {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find((l) => l.startsWith("ERROR:"));
  const msg = (err ?? lines.at(-1) ?? "yt-dlp failed")
    .replace(/^ERROR:\s*/, "")
    .replace(/^\[[^\]]+\]\s*[^:]{0,80}:\s*/, "") // "[youtube] abc123: " prefix
    .replace(/\s*\(caused by .*$/, "")
    .slice(0, 400);
  if (/sign in to confirm|not a bot|age-restricted|confirm your age|members-only|private video|login required|cookies/i.test(msg)) {
    return `${msg} — try again with "Sign-in cookies" set to the browser where you're logged in.`;
  }
  if (/HTTP Error 403|nsig|signature|Requested format is not available/i.test(msg)) {
    return `${msg} — the site may have changed; update yt-dlp on the Tools page and retry.`;
  }
  return msg;
}

// ─── Look up ────────────────────────────────────────────────────────────────
interface RawFormat { vcodec?: string; acodec?: string; height?: number | null }
export interface RawInfo {
  _type?: string; id?: string; title?: string; uploader?: string; channel?: string; duration?: number;
  thumbnail?: string; webpage_url?: string; extractor_key?: string; is_live?: boolean; language?: string | null;
  formats?: RawFormat[]; vcodec?: string; acodec?: string; height?: number;
  subtitles?: Record<string, unknown>; automatic_captions?: Record<string, unknown>;
}

/** Caption tracks worth offering: uploaded subtitles, and auto-captions in the video's original language. */
export function captionLangs(info: RawInfo) {
  const manual = Object.keys(info.subtitles ?? {}).filter((k) => k !== "live_chat" && !k.startsWith("danmaku"));
  const autoKeys = Object.keys(info.automatic_captions ?? {});
  let auto = autoKeys.filter((k) => k.endsWith("-orig")).map((k) => k.replace(/-orig$/, ""));
  if (!auto.length && info.language && autoKeys.includes(info.language)) auto = [info.language];
  if (!auto.length && autoKeys.length && autoKeys.length <= 3) auto = autoKeys; // non-YouTube sites: a short, real list
  return { manual, auto };
}

/** `yt-dlp -J` for one link. */
export async function rawInfo(url: string, cookies: Browser | null): Promise<RawInfo> {
  const r = await run(ytDlpPath(), [...(await baseArgs(cookies)), "-J", "--", url], { timeoutMs: 90_000 });
  if (r.code !== 0) throw new ToolError(lastError(r.stderr));
  let info: RawInfo;
  try { info = JSON.parse(r.stdout); } catch { throw new ToolError("yt-dlp returned something unexpected for that link."); }
  if (info._type === "playlist") throw new ToolError("That's a playlist. Paste a link to a single video.");
  if (info.is_live) throw new ToolError("Live streams aren't supported.");
  return info;
}

export async function lookup(url: string, cookies: Browser | null = null): Promise<MediaInfo> {
  const info = await rawInfo(url, cookies);
  const formats = info.formats?.length ? info.formats : [info];
  const hasVideo = formats.some((f) => f.vcodec !== "none");
  const hasAudio = formats.some((f) => f.acodec !== "none");
  const heights = [...new Set(formats.filter((f) => f.vcodec !== "none" && f.height).map((f) => f.height as number))].sort((a, b) => b - a);
  return {
    url,
    id: info.id ?? "",
    title: info.title ?? "Untitled",
    uploader: info.channel ?? info.uploader ?? null,
    duration: info.duration ?? null,
    thumbnail: info.thumbnail ?? null,
    site: info.extractor_key ?? null,
    heights,
    hasVideo,
    hasAudio,
    language: info.language ?? null,
    captions: captionLangs(info),
  };
}

// ─── Jobs ───────────────────────────────────────────────────────────────────
interface Internal { job: MediaJob; opts: JobOptions; dir: string; child: ChildProcess | null; filePath: string | null; started: boolean }

const jobs = () => (g.__mediaJobs ??= new Map());
const view = (i: Internal): MediaJob => ({ ...i.job });

export function listJobs(): MediaJob[] {
  sweep();
  return [...jobs().values()].map(view).sort((a, b) => b.createdAt - a.createdAt);
}

export function getJob(id: string) { const i = jobs().get(id); return i ? view(i) : null; }
export function jobFile(id: string) {
  const i = jobs().get(id);
  return i?.job.status === "done" && i.filePath && fs.existsSync(i.filePath) ? { path: i.filePath, name: i.job.fileName ?? path.basename(i.filePath) } : null;
}

export function parseJobOptions(body: Record<string, unknown>): JobOptions {
  const kind = body.kind === "audio" ? "audio" : body.kind === "video" ? "video" : null;
  if (!kind) throw new ToolError("Unknown download type.");
  const q = String(body.audioQuality ?? "320") as AudioQuality;
  const h = Number(body.maxHeight);
  const mode = (body.videoMode === "best" ? "best" : "compatible") as VideoMode;
  const cookies = BROWSERS.includes(body.cookies as Browser) ? (body.cookies as Browser) : null;
  return {
    url: parseUrl(body.url),
    kind,
    audioQuality: AUDIO_QUALITIES.includes(q) ? q : "320",
    maxHeight: Number.isInteger(h) && h > 0 && h <= 8640 ? h : null,
    videoMode: mode,
    cookies,
    title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
    thumbnail: typeof body.thumbnail === "string" && /^https?:\/\//.test(body.thumbnail) ? body.thumbnail : null,
  };
}

export function createJob(opts: JobOptions): MediaJob {
  ytDlpPath(); // fail fast if yt-dlp is missing
  sweep();
  const id = randomUUID().slice(0, 12);
  const dir = path.join(WORK_DIR, id);
  const job: MediaJob = {
    id, kind: opts.kind, url: opts.url, title: opts.title ?? opts.url, thumbnail: opts.thumbnail,
    status: "queued", stage: "Waiting", percent: 0, part: 0, speed: null, eta: null,
    fileName: null, size: null, error: null, createdAt: Date.now(), finishedAt: null,
    label: opts.kind === "audio" ? `MP3 · ${opts.audioQuality} kbps` : videoLabel(opts),
  };
  jobs().set(id, { job, opts, dir, child: null, filePath: null, started: false });
  pump();
  return { ...job };
}

function videoLabel(o: JobOptions) {
  return `${o.maxHeight ? `≤${o.maxHeight}p` : "Best"} · ${o.videoMode === "best" ? "max quality" : "MP4 (H.264)"}`;
}

/** Starts queued jobs, oldest first, keeping at most MAX_RUNNING downloads at once. */
function pump() {
  const all = [...jobs().values()];
  const running = all.filter((i) => i.started && (i.job.status === "downloading" || i.job.status === "processing")).length;
  const queued = all.filter((i) => !i.started && i.job.status === "queued").sort((a, b) => a.job.createdAt - b.job.createdAt);
  for (const i of queued.slice(0, Math.max(0, MAX_RUNNING - running))) {
    i.started = true;
    void start(i);
  }
}

export function formatFor(o: Pick<JobOptions, "maxHeight" | "videoMode">) {
  const h = o.maxHeight ? `[height<=${o.maxHeight}]` : "";
  if (o.videoMode === "best") return `bv*${h}+ba/b${h}/bv*+ba/b`;
  // Edit-friendly: H.264 + AAC in MP4 when the site has it, otherwise the closest thing.
  return [
    `bv*${h}[vcodec^=avc1]+ba[acodec^=mp4a]`,
    `b${h}[vcodec^=avc1][acodec^=mp4a]`,
    `bv*${h}[ext=mp4]+ba[ext=m4a]`,
    `bv*${h}+ba`, `b${h}`, "bv*+ba", "b",
  ].join("/");
}

const PROGRESS = "download:@@P %(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.fragment_index)s|%(progress.fragment_count)s";
// Centre-crop the thumbnail to a square so it looks right as album art. (Converting to PNG means the
// crop also runs when the site's thumbnail is already a JPG — yt-dlp skips same-format conversions.)
const SQUARE_COVER = `ThumbnailsConvertor+ffmpeg_o:-vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`;

async function start(i: Internal) {
  const { job, opts: o } = i;
  try {
    fs.mkdirSync(i.dir, { recursive: true });
    const args = [
      ...(await baseArgs(o.cookies)),
      "--newline", "--progress", "--progress-template", PROGRESS,
      "--no-mtime", "--windows-filenames", "--no-part",
      "-o", "%(title).150B [%(id)s].%(ext)s",
    ];
    if (o.kind === "audio") {
      args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", `${o.audioQuality}K`,
        "--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "png", "--ppa", SQUARE_COVER);
    } else {
      args.push("-f", formatFor(o), "--merge-output-format", "mp4/mkv", "--embed-metadata");
    }
    args.push("--", o.url);

    Object.assign(job, { status: "downloading", stage: "Starting", percent: 0 });
    const child = spawn(ytDlpPath(), args, { cwd: i.dir, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    i.child = child;
    let stderr = "";
    let buf = "";
    const onLine = (line: string) => track(job, line.trim());
    child.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    child.stderr.on("data", (d) => { stderr += d; if (stderr.length > 20_000) stderr = stderr.slice(-10_000); });
    const code = await new Promise<number | null>((resolve) => {
      child.on("error", (e) => { stderr += String(e); resolve(-1); });
      child.on("close", resolve);
    });
    i.child = null;
    if (job.status === "canceled") return;
    if (code !== 0) throw new ToolError(lastError(stderr));

    const file = pickOutput(i.dir, o.kind);
    if (!file) throw new ToolError("yt-dlp finished but no file was produced.");
    i.filePath = file;
    Object.assign(job, {
      status: "done", stage: "Ready", percent: 100, speed: null, eta: null,
      fileName: path.basename(file), size: fs.statSync(file).size, finishedAt: Date.now(),
    });
    if (job.title === job.url) job.title = path.basename(file).replace(/\s\[[^\]]+\]\.\w+$/, "");
  } catch (e) {
    if (job.status !== "canceled") {
      Object.assign(job, { status: "error", stage: "Failed", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    }
  } finally {
    pump();
  }
}

/** Turns one line of yt-dlp output into job progress. */
function track(job: MediaJob, line: string) {
  if (line.startsWith("@@P ")) {
    const [status, done, total, estimate, speed, eta, fi, fc] = line.slice(4).split("|");
    const num = (s: string) => (s && s !== "NA" && s !== "None" ? Number(s) : NaN);
    const t = num(total) || num(estimate);
    let pct = num(done) / t;
    if (!Number.isFinite(pct)) pct = num(fi) / num(fc);
    if (Number.isFinite(pct)) job.percent = Math.max(0, Math.min(100, Math.round(pct * 1000) / 10));
    if (status === "finished") job.percent = 100;
    job.speed = speed && speed !== "NA" && !speed.includes("Unknown") ? speed.trim() : null;
    job.eta = eta && eta !== "NA" && !eta.includes("Unknown") ? eta.trim() : null;
    job.stage = job.part > 1 ? `Downloading part ${job.part}` : "Downloading";
    return;
  }
  const stage: [RegExp, string][] = [
    [/^\[Merger\]/, "Merging video + audio"],
    [/^\[ExtractAudio\]/, "Converting to MP3"],
    [/^\[ThumbnailsConvertor\]/, "Preparing cover art"],
    [/^\[EmbedThumbnail\]/, "Adding cover art"],
    [/^\[Metadata\]/, "Writing tags"],
    [/^\[(VideoRemuxer|VideoConvertor|FixupM3u8|FixupM4a|Fixup\w*)\]/, "Finishing up"],
  ];
  if (/^\[download\] Destination:/.test(line)) {
    job.part += 1;
    job.percent = 0;
    job.stage = job.part > 1 ? `Downloading part ${job.part}` : "Downloading";
    return;
  }
  for (const [re, label] of stage) {
    if (re.test(line)) { job.status = "processing"; job.stage = label; job.speed = null; job.eta = null; return; }
  }
}

const MEDIA_EXT = /\.(mp3|m4a|opus|ogg|wav|flac|aac|mp4|mkv|webm|mov|m4v|flv|avi|3gp|ts)$/i;
function pickOutput(dir: string, kind: MediaJob["kind"]) {
  const files = fs.readdirSync(dir)
    .filter((f) => MEDIA_EXT.test(f) && !/\.f\d+\.\w+$/.test(f) && !f.endsWith(".part"))
    .map((f) => path.join(dir, f));
  const preferred = files.filter((f) => (kind === "audio" ? f.toLowerCase().endsWith(".mp3") : !/\.(mp3|m4a|opus|ogg|wav|flac|aac)$/i.test(f)));
  const pool = preferred.length ? preferred : files;
  return pool.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] ?? null;
}

/** Cancels a running job, or removes a finished one together with its file. */
export function removeJob(id: string) {
  const i = jobs().get(id);
  if (!i) return false;
  if (i.child) {
    i.job.status = "canceled";
    i.child.kill();
  }
  jobs().delete(id);
  // give the killed process a moment to release its files before deleting them
  setTimeout(() => fs.rmSync(i.dir, { recursive: true, force: true }), i.child ? 1500 : 0);
  pump();
  return true;
}

/** Drops old finished jobs and any leftover work folders from earlier server runs. */
function sweep() {
  const now = Date.now();
  for (const [id, i] of jobs()) {
    if (i.job.finishedAt && now - i.job.finishedAt > KEEP_MS) removeJob(id);
  }
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(WORK_DIR, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || jobs().has(e.name)) continue;
    const p = path.join(WORK_DIR, e.name);
    try { if (now - fs.statSync(p).mtimeMs > KEEP_MS) fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** `yt-dlp -U` — only for the copy this project downloaded into .tools/bin. */
export async function updateYtDlp() {
  const bin = findYtDlp();
  if (!bin) throw new ToolError("yt-dlp isn't installed yet. Run `npm run tools:setup`.");
  if (bin.source !== "project") throw new ToolError(`This yt-dlp came from ${bin.path}. Update it the way you installed it.`);
  const r = await run(bin.path, ["-U"], { timeoutMs: 180_000 });
  g.__jsRuntimes = undefined;
  const out = (r.stdout + "\n" + r.stderr).trim().split(/\r?\n/).filter(Boolean);
  if (r.code !== 0) throw new ToolError(out.at(-1) ?? "Update failed.");
  return out.at(-1) ?? "Up to date.";
}
