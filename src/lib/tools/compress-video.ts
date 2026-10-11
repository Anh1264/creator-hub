// Video compressor: re-encodes an uploaded video with ffmpeg, either at a quality level (CRF) or to
// fit a target file size (two-pass). One job runs at a time; files live in .tools/work/c-<id>/.
import "server-only";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WORK_DIR, findFfmpeg, findFfprobe, run } from "./bin";
import { ToolError } from "./media";
import {
  SHORT_SIDES, VIDEO_LEVELS, fmtDuration,
  type CompressJob, type VideoCodecs, type VideoCompressOptions, type VideoLevel,
} from "./shared";

const KEEP_MS = 6 * 60 * 60_000;
const PRESET = { fast: "veryfast", balanced: "medium", thorough: "slow" } as const;
/** Bits per pixel per frame below which a video turns to mush (used to pick a resolution for a target size). */
const MIN_BPP = { h264: 0.055, hevc: 0.038 } as const;
/** Hardware encoders (VideoToolbox) can't do CRF; these bits-per-pixel stand in for the quality levels. */
const LEVEL_BPP: Record<VideoLevel, number> = { light: 0.14, balanced: 0.09, strong: 0.06, max: 0.04 };

interface Probe { duration: number; width: number; height: number; fps: number; hasAudio: boolean; videoCodec: string }
interface Internal {
  job: CompressJob; opts: VideoCompressOptions; dir: string; input: string; output: string | null;
  probe: Probe; child: ChildProcess | null; started: boolean;
}

const g = globalThis as unknown as { __compressJobs?: Map<string, Internal>; __codecs?: { ff: string; value: VideoCodecs } };
const jobs = () => (g.__compressJobs ??= new Map());
const view = (i: Internal): CompressJob => ({ ...i.job });

function ffmpeg() {
  const ff = findFfmpeg();
  if (!ff) throw new ToolError("ffmpeg isn't installed. Run `npm install` in the project folder, then try again.");
  return ff.path;
}

// ─── Encoders available in this ffmpeg build ───────────────────────────────
export async function videoCodecs(): Promise<VideoCodecs> {
  const ff = findFfmpeg()?.path;
  if (!ff) return { h264: null, hevc: null };
  if (g.__codecs?.ff === ff) return g.__codecs.value;
  const r = await run(ff, ["-hide_banner", "-encoders"], { timeoutMs: 20_000 });
  const has = (name: string) => new RegExp(`^\\s*V\\S*\\s+${name}\\s`, "m").test(r.stdout);
  const pick = (...names: string[]) => names.find(has) ?? null;
  const value = { h264: pick("libx264", "h264_videotoolbox"), hevc: pick("libx265", "hevc_videotoolbox") };
  g.__codecs = { ff, value };
  return value;
}

// ─── Options ────────────────────────────────────────────────────────────────
export function parseVideoOptions(q: URLSearchParams): VideoCompressOptions {
  const level = q.get("level") ?? "balanced";
  const mb = Number(q.get("targetMB"));
  const side = Number(q.get("shortSide"));
  const fps = Number(q.get("fps"));
  const audio = q.get("audio");
  const speed = q.get("speed");
  return {
    mode: q.get("mode") === "size" ? "size" : "quality",
    level: level in VIDEO_LEVELS ? (level as VideoLevel) : "balanced",
    targetMB: Number.isFinite(mb) && mb >= 1 && mb <= 20_000 ? mb : 25,
    shortSide: (SHORT_SIDES as readonly number[]).includes(side) ? side : null,
    fps: fps === 30 || fps === 24 ? fps : null,
    codec: q.get("codec") === "hevc" ? "hevc" : "h264",
    audio: audio === "64" || audio === "none" ? audio : "128",
    speed: speed === "fast" || speed === "thorough" ? speed : "balanced",
  };
}

function optionsLabel(o: VideoCompressOptions) {
  const parts = [o.codec === "hevc" ? "H.265" : "H.264", o.mode === "size" ? `≤ ${o.targetMB} MB` : VIDEO_LEVELS[o.level].label];
  if (o.shortSide) parts.push(`${o.shortSide}p`);
  if (o.fps) parts.push(`${o.fps} fps`);
  if (o.audio === "none") parts.push("no audio");
  return parts.join(" · ");
}

// ─── Probe ──────────────────────────────────────────────────────────────────
interface RawStream { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[]; duration?: string }

async function probe(file: string): Promise<Probe> {
  const fp = findFfprobe();
  if (!fp) throw new ToolError("ffprobe isn't installed. Run `npm install` in the project folder, then try again.");
  const r = await run(fp.path, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60_000 });
  let data: { streams?: RawStream[]; format?: { duration?: string } };
  try { data = JSON.parse(r.stdout); } catch { throw new ToolError("Can't read that file. Is it a video?"); }
  const v = data.streams?.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg" && s.codec_name !== "png");
  if (!v?.width || !v.height) throw new ToolError("That file has no video track.");
  const duration = Number(data.format?.duration ?? v.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new ToolError("Can't tell how long that video is, so it can't be compressed.");
  const rate = (s?: string) => { const [a, b] = (s ?? "").split("/").map(Number); return a && b ? a / b : NaN; };
  let fps = rate(v.avg_frame_rate);
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) fps = rate(v.r_frame_rate);
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) fps = 30;
  const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0)) % 180;
  const [width, height] = rot === 90 ? [v.height, v.width] : [v.width, v.height]; // as displayed (ffmpeg auto-rotates)
  return { duration, width, height, fps, hasAudio: !!data.streams?.some((s) => s.codec_type === "audio"), videoCodec: v.codec_name ?? "" };
}

// ─── Jobs ───────────────────────────────────────────────────────────────────
export function listCompressJobs(): CompressJob[] {
  sweep();
  return [...jobs().values()].map(view).sort((a, b) => b.createdAt - a.createdAt);
}

export function compressJobFile(id: string, which: "output" | "thumb") {
  const i = jobs().get(id);
  if (!i) return null;
  if (which === "thumb") {
    const p = path.join(i.dir, "thumb.jpg");
    return fs.existsSync(p) ? { path: p, name: "thumb.jpg" } : null;
  }
  return i.job.status === "done" && i.output && fs.existsSync(i.output) ? { path: i.output, name: i.job.fileName ?? path.basename(i.output) } : null;
}

/** Streams the upload to disk, checks it's a video, makes a thumbnail, and queues it. */
export async function createCompressJob(body: ReadableStream<Uint8Array>, fileName: string, opts: VideoCompressOptions): Promise<CompressJob> {
  const ff = ffmpeg();
  const codecs = await videoCodecs();
  if (!codecs[opts.codec]) {
    throw new ToolError(opts.codec === "hevc" ? "This computer's ffmpeg can't encode H.265. Pick H.264." : "This computer's ffmpeg has no H.264 encoder.");
  }
  sweep();
  const id = randomUUID().slice(0, 12);
  const dir = path.join(WORK_DIR, `c-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(fileName).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "video.mp4";
  const ext = path.extname(safe).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp4";
  const input = path.join(dir, `in${ext}`);
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), fs.createWriteStream(input));
    const info = await probe(input);
    // A poster frame for the list. Not essential, so failures are ignored.
    await run(ff, ["-hide_banner", "-nostdin", "-y", "-ss", String(Math.min(1, info.duration / 2)), "-i", input,
      "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", path.join(dir, "thumb.jpg")], { timeoutMs: 30_000 });
    const base = safe.replace(/\.[^.]+$/, "") || "video";
    const job: CompressJob = {
      id, name: safe, fileName: `${base}-compressed.mp4`, label: optionsLabel(opts),
      status: "queued", stage: "Waiting", percent: 0, eta: null,
      inputSize: fs.statSync(input).size, outputSize: null,
      duration: info.duration, width: info.width, height: info.height, outWidth: null, outHeight: null,
      hasThumb: fs.existsSync(path.join(dir, "thumb.jpg")), bigger: false, note: null, error: null,
      createdAt: Date.now(), finishedAt: null, tookMs: null,
    };
    jobs().set(id, { job, opts, dir, input, output: null, probe: info, child: null, started: false });
    pump();
    return { ...job };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

function pump() {
  const all = [...jobs().values()];
  if (all.some((i) => i.started && i.job.status === "compressing")) return;
  const next = all.filter((i) => !i.started && i.job.status === "queued").sort((a, b) => a.job.createdAt - b.job.createdAt)[0];
  if (next) { next.started = true; void work(next); }
}

export function removeCompressJob(id: string) {
  const i = jobs().get(id);
  if (!i) return false;
  if (i.child) { i.job.status = "canceled"; i.child.kill(); }
  jobs().delete(id);
  setTimeout(() => fs.rmSync(i.dir, { recursive: true, force: true }), i.child ? 1500 : 0);
  pump();
  return true;
}

function sweep() {
  const now = Date.now();
  for (const [id, i] of jobs()) if (i.job.finishedAt && now - i.job.finishedAt > KEEP_MS) removeCompressJob(id);
}

// ─── The encode ─────────────────────────────────────────────────────────────
interface Plan {
  passes: (string[])[]; note: string | null; shortSide: number | null; label: string;
  /** size mode: the byte limit, and the final pass rebuilt at another bitrate (to re-fit after an overshoot) */
  fit: { bytes: number; videoK: number; lastPass: (videoK: number) => string[] } | null;
}

/** Works out the ffmpeg arguments: filters, encoder settings, and one or two passes. */
export function plan(p: Probe, o: VideoCompressOptions, codecs: VideoCodecs, inputSize: number): Plan {
  let mode = o.mode;
  let note: string | null = null;
  let level = o.level;
  const encoder = codecs[o.codec]!;
  const hw = encoder.endsWith("_videotoolbox");
  const srcShort = Math.min(p.width, p.height);
  const fps = o.fps && p.fps > o.fps + 0.5 ? o.fps : p.fps;
  let short = o.shortSide && o.shortSide < srcShort ? o.shortSide : srcShort;
  let audioK = o.audio === "none" || !p.hasAudio ? 0 : Number(o.audio);
  let videoK = 0;

  if (mode === "size") {
    const targetBytes = o.targetMB * 1_000_000;
    if (inputSize <= targetBytes * 0.97) {
      mode = "quality";
      level = "balanced";
      note = `Already under ${o.targetMB} MB, so it was compressed at Balanced quality instead.`;
    } else {
      // kbit/s for the whole file, leaving ~4% for the MP4 container and encoder overshoot
      const totalK = (targetBytes * 8 * 0.96) / 1000 / p.duration;
      if (totalK - audioK < 150 && audioK > 64) audioK = 64;
      videoK = Math.floor(totalK - audioK);
      if (videoK < 80) {
        const needMB = Math.ceil(((80 + audioK) * 1000 * p.duration) / 8 / 0.96 / 1_000_000);
        throw new ToolError(`${o.targetMB} MB is too small for a ${fmtDuration(p.duration)} video. Try at least ${needMB} MB${audioK ? ", or remove the audio" : ""}.`);
      }
      if (audioK < Number(o.audio) && o.audio !== "none" && p.hasAudio) note = "Audio lowered to 64 kbps to make room for the picture.";
      // Too few bits for this resolution → step down until each frame gets enough of them.
      const minBpp = MIN_BPP[o.codec];
      const aspect = Math.max(p.width, p.height) / srcShort;
      const fits = (s: number) => (videoK * 1000) / (s * s * aspect * fps) >= minBpp;
      if (!fits(short)) {
        const options = [1080, 720, 540, 480, 360].filter((s) => s < short);
        const chosen = options.find(fits) ?? 360;
        if (chosen < short) {
          note = [note, `Lowered to ${chosen}p so ${o.targetMB} MB still looks sharp.`].filter(Boolean).join(" ");
          short = chosen;
        }
      }
    }
  }

  // Filters: frame rate, size (shorter side), even dimensions, 8-bit 4:2:0 for compatibility.
  const vf: string[] = [];
  if (fps !== p.fps) vf.push(`fps=${fps}`);
  if (short < srcShort) vf.push(p.width >= p.height ? `scale=-2:${short}` : `scale=${short}:-2`);
  else vf.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  vf.push("format=yuv420p");

  const pre = ["-hide_banner", "-nostdin", "-y", "-i", "INPUT", "-map", "0:v:0"];
  const audio = audioK ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", `${audioK}k`] : ["-an"];
  const tail = ["-movflags", "+faststart", "-map_metadata", "0", "-progress", "pipe:1", "-nostats", "OUTPUT"];
  const tag = o.codec === "hevc" ? ["-tag:v", "hvc1"] : [];

  let passes: string[][];
  let fit: Plan["fit"] = null;
  if (hw) {
    const w = short * (Math.max(p.width, p.height) / srcShort);
    const kbps = mode === "size" ? videoK : Math.round((LEVEL_BPP[level] * (o.codec === "hevc" ? 0.7 : 1) * w * short * fps) / 1000);
    const one = (k: number) => [...pre, "-vf", vf.join(","), "-c:v", encoder, "-b:v", `${k}k`, "-maxrate", `${Math.round(k * 1.5)}k`, "-bufsize", `${k * 2}k`, "-allow_sw", "1", ...tag, ...audio, ...tail];
    passes = [one(kbps)];
    if (mode === "size") fit = { bytes: o.targetMB * 1_000_000, videoK: kbps, lastPass: one };
  } else if (mode === "quality") {
    const crf = VIDEO_LEVELS[level].crf + (o.codec === "hevc" ? 4 : 0);
    const x265 = o.codec === "hevc" ? ["-x265-params", "log-level=error"] : [];
    passes = [[...pre, "-vf", vf.join(","), "-c:v", encoder, "-preset", PRESET[o.speed], "-crf", String(crf), ...x265, ...tag, ...audio, ...tail]];
  } else {
    // Two passes: the first measures the video, the second spends the bit budget where it's needed.
    // Pass logs are written next to the job (cwd) with relative names, so Windows paths never reach x265's ':' parser.
    const v = (k: number) => ["-vf", vf.join(","), "-c:v", encoder, "-preset", PRESET[o.speed], "-b:v", `${k}k`];
    const pass = (n: 1 | 2) => (o.codec === "hevc"
      ? ["-x265-params", `log-level=error:pass=${n}:stats=x265.log`]
      : ["-pass", String(n), "-passlogfile", "x264"]);
    const second = (k: number) => [...pre, ...v(k), ...pass(2), ...tag, ...audio, ...tail];
    passes = [[...pre, ...v(videoK), ...pass(1), "-an", "-f", "null", "-progress", "pipe:1", "-nostats", "-"], second(videoK)];
    fit = { bytes: o.targetMB * 1_000_000, videoK, lastPass: second };
  }
  const label = [o.codec === "hevc" ? "H.265" : "H.264",
    o.mode === "size" ? `≤ ${o.targetMB} MB` : VIDEO_LEVELS[o.level].label,
    short < srcShort ? `${short}p` : null, fps !== p.fps ? `${fps} fps` : null, !audioK && p.hasAudio ? "no audio" : null,
    hw ? "hardware" : null].filter(Boolean).join(" · ");
  return { passes, note, shortSide: short < srcShort ? short : null, label, fit };
}

const isCanceled = (j: CompressJob) => j.status === "canceled";

async function work(i: Internal) {
  const { job } = i;
  const started = Date.now();
  try {
    const codecs = await videoCodecs();
    const p = plan(i.probe, i.opts, codecs, job.inputSize);
    job.note = p.note;
    job.label = p.label;
    const outDir = path.join(i.dir, "out");
    fs.mkdirSync(outDir, { recursive: true });
    const output = path.join(outDir, job.fileName ?? "compressed.mp4");
    const n = p.passes.length;
    for (let k = 0; k < n; k++) {
      const args = p.passes[k].map((a) => (a === "INPUT" ? i.input : a === "OUTPUT" ? output : a));
      const [from, span] = n === 2 ? (k === 0 ? [0, 30] : [30, 70]) : [0, 100];
      job.status = "compressing";
      job.stage = n === 2 ? (k === 0 ? "Analyzing (pass 1 of 2)" : "Compressing (pass 2 of 2)") : "Compressing";
      await encode(i, args, from, span, started);
      if (isCanceled(job)) return;
    }
    // Encoders overshoot a little on short or hard clips; if it doesn't fit, redo the last pass with
    // the bitrate scaled down by the overshoot (the pass-1 stats are reused, so this is one more pass).
    let size = fs.statSync(output).size;
    for (let tries = 0; p.fit && size > p.fit.bytes && tries < 2; tries++) {
      const videoK = Math.floor(p.fit.videoK * ((p.fit.bytes * 0.97) / size) * (tries ? 0.95 : 1));
      if (videoK < 50) break;
      p.fit.videoK = videoK;
      const args = p.fit.lastPass(videoK).map((a) => (a === "INPUT" ? i.input : a === "OUTPUT" ? output : a));
      job.stage = `Re-fitting to ${i.opts.targetMB} MB`;
      job.percent = 0;
      await encode(i, args, 0, 100, Date.now());
      if (isCanceled(job)) return;
      size = fs.statSync(output).size;
    }
    if (p.fit && size > p.fit.bytes) job.note = [job.note, `Couldn't get under ${i.opts.targetMB} MB; this is as close as it gets.`].filter(Boolean).join(" ");
    i.output = output;
    const out = await probe(output).catch(() => null);
    Object.assign(job, {
      status: "done", stage: "Ready", percent: 100, eta: null, outputSize: size,
      outWidth: out?.width ?? null, outHeight: out?.height ?? null, bigger: size >= job.inputSize,
      finishedAt: Date.now(), tookMs: Date.now() - started,
    });
    for (const f of fs.readdirSync(i.dir)) if (/^(x264|x265)/.test(f)) fs.rmSync(path.join(i.dir, f), { force: true });
    fs.rmSync(i.input, { force: true }); // the original stays on the user's computer; free the disk
  } catch (e) {
    if (job.status !== "canceled") {
      Object.assign(job, { status: "error", stage: "Failed", eta: null, error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
    }
  } finally {
    i.child = null;
    pump();
  }
}

function encode(i: Internal, args: string[], from: number, span: number, started: number) {
  const { job } = i;
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg(), args, { cwd: i.dir, windowsHide: true });
    i.child = child;
    let stderr = "";
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (!m) continue;
        const t = Number(m[1]) / 1e6;
        const pct = from + Math.max(0, Math.min(1, t / i.probe.duration)) * span;
        job.percent = Math.round(pct * 10) / 10;
        const elapsed = (Date.now() - started) / 1000;
        job.eta = pct > 2 ? Math.round((elapsed / pct) * (100 - pct)) : null;
      }
    });
    child.stderr.on("data", (d) => { stderr += d; if (stderr.length > 20_000) stderr = stderr.slice(-10_000); });
    child.on("error", (e) => reject(new ToolError(`Couldn't start ffmpeg: ${e.message}`)));
    child.on("close", (code) => {
      if (job.status === "canceled" || code === 0) return resolve();
      const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const msg = lines.reverse().find((l) => /error|invalid|failed|not supported|unknown/i.test(l)) ?? lines[0] ?? `ffmpeg exited with code ${code}`;
      reject(new ToolError(`ffmpeg: ${msg.slice(0, 300)}`));
    });
  });
}
