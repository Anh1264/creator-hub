// Local speech-to-text: whisper.cpp through @fugood/whisper.node (Metal GPU on Apple Silicon, CPU elsewhere).
// Models are downloaded once into .tools/models/ from the official whisper.cpp model repo.
import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TOOLS_DIR, findFfmpeg, run } from "./bin";
import { ToolError } from "./media";
import { WHISPER_MODELS, type ModelStatus, type Segment, type WhisperModel } from "./shared";

export const MODELS_DIR = path.join(TOOLS_DIR, "models");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

type Ctx = Awaited<ReturnType<typeof import("@fugood/whisper.node").initWhisper>>;
type Download = { progress: number; error: string | null; active: boolean };
const g = globalThis as unknown as {
  __whisper?: { key: WhisperModel; ctx: Ctx } | null;
  __whisperDownloads?: Map<WhisperModel, Download>;
  __whisperQueue?: Promise<unknown>;
  __whisperIdle?: ReturnType<typeof setTimeout>;
};
const IDLE_MS = 10 * 60_000; // free the model's memory after 10 idle minutes

function scheduleRelease() {
  clearTimeout(g.__whisperIdle);
  g.__whisperIdle = setTimeout(() => {
    const w = g.__whisper;
    g.__whisper = null;
    void w?.ctx.release().catch(() => undefined);
  }, IDLE_MS);
}
const downloads = () => (g.__whisperDownloads ??= new Map());

export const modelPath = (key: WhisperModel) =>
  path.join(process.env.WHISPER_MODELS_DIR || MODELS_DIR, WHISPER_MODELS[key].file);

export function isInstalled(key: WhisperModel) {
  try { return fs.statSync(modelPath(key)).size > 10_000_000; } catch { return false; }
}

export function modelStatuses(): ModelStatus[] {
  return (Object.keys(WHISPER_MODELS) as WhisperModel[]).map((key) => {
    const d = downloads().get(key);
    return {
      key, ...WHISPER_MODELS[key], installed: isInstalled(key),
      downloading: !!d?.active, progress: d?.progress ?? 0, error: d?.error ?? null,
    };
  });
}

/** Starts downloading a model in the background (progress via modelStatuses). */
export function downloadModel(key: WhisperModel) {
  if (isInstalled(key) || downloads().get(key)?.active) return;
  const state: Download = { progress: 0, error: null, active: true };
  downloads().set(key, state);
  void (async () => {
    const dest = modelPath(key);
    const part = dest + ".part";
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await fetch(MODEL_URL + WHISPER_MODELS[key].file, { redirect: "follow" });
      if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
      const total = Number(res.headers.get("content-length")) || 0;
      let got = 0;
      const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
      body.on("data", (c: Buffer) => { got += c.length; if (total) state.progress = Math.round((got / total) * 1000) / 10; });
      await pipeline(body, fs.createWriteStream(part));
      if (total && fs.statSync(part).size !== total) throw new Error("download was cut short — try again");
      fs.renameSync(part, dest);
      state.progress = 100;
    } catch (e) {
      fs.rmSync(part, { force: true });
      state.error = e instanceof Error ? e.message : String(e);
    } finally {
      state.active = false;
    }
  })();
}

async function context(key: WhisperModel): Promise<Ctx> {
  if (g.__whisper?.key === key) return g.__whisper.ctx;
  if (!isInstalled(key)) throw new ToolError(`The ${WHISPER_MODELS[key].label} model isn't downloaded yet.`);
  if (g.__whisper) { await g.__whisper.ctx.release().catch(() => undefined); g.__whisper = null; }
  const { initWhisper } = await import("@fugood/whisper.node");
  const ctx = await initWhisper({ filePath: modelPath(key), useGpu: true });
  g.__whisper = { key, ctx };
  return ctx;
}

/** Any audio/video file → 16 kHz mono WAV, the input whisper.cpp expects. */
export async function toWav(input: string, output: string) {
  const ff = findFfmpeg();
  if (!ff) throw new ToolError("ffmpeg is missing — run npm install.");
  const r = await run(ff.path, ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output], { timeoutMs: 30 * 60_000 });
  if (r.code !== 0 || !fs.existsSync(output)) throw new ToolError(`Couldn't read the audio: ${r.stderr.trim().split("\n").at(-1) ?? "ffmpeg failed"}`);
}

export interface WhisperRun {
  promise: Promise<{ segments: Segment[]; language: string | null; languages: string[] }>;
  stop: () => void;
}

type Chunk = { start: number; end: number }; // ms

/** Silent stretches (ms) found by ffmpeg's silencedetect. */
async function silences(wav: string): Promise<Chunk[]> {
  const ff = findFfmpeg();
  if (!ff) return [];
  const r = await run(ff.path, ["-hide_banner", "-nostats", "-i", wav, "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"], { timeoutMs: 10 * 60_000 });
  const out: Chunk[] = [];
  let open: number | null = null;
  for (const line of r.stderr.split("\n")) {
    const a = line.match(/silence_start: (-?[\d.]+)/);
    const b = line.match(/silence_end: ([\d.]+)/);
    if (a) open = Math.max(0, Number(a[1]) * 1000);
    if (b && open !== null) { out.push({ start: open, end: Number(b[1]) * 1000 }); open = null; }
  }
  return out;
}

const wavDurationMs = (wav: string) => Math.max(0, (fs.statSync(wav).size - 44) / 32); // 16 kHz × 16-bit mono = 32 bytes/ms

/**
 * Splits audio into ≤28 s windows, cutting inside pauses where possible, and drops windows that are
 * pure silence (Whisper invents text on silence). Each window gets its own language detection.
 */
function planChunks(total: number, quiet: Chunk[]): Chunk[] {
  const MAX = 28_000, MIN = 10_000;
  const chunks: Chunk[] = [];
  let at = 0;
  while (at < total - 300) {
    let cut = Math.min(total, at + MAX);
    if (cut < total) {
      const gaps = quiet.map((q) => (q.start + q.end) / 2).filter((m) => m > at + MIN && m <= at + MAX);
      if (gaps.length) cut = gaps[gaps.length - 1];
    }
    const silent = quiet.some((q) => q.start <= at + 50 && q.end >= cut - 50);
    if (!silent) chunks.push({ start: Math.round(at), end: Math.round(cut) });
    at = cut;
  }
  return chunks;
}

/** Whisper sometimes loops ("A. A. A. A."). Collapse repeated sentences and drop repeated segments. */
export function cleanLoops(segs: Segment[]): Segment[] {
  const norm = (t: string) => t.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  const out: Segment[] = [];
  for (const s of segs) {
    const parts = s.text.match(/[^.!?。！？]+[.!?。！？]*/gu) ?? [s.text];
    const kept: string[] = [];
    for (const p of parts) if (!kept.length || norm(kept[kept.length - 1]) !== norm(p)) kept.push(p.trim());
    const text = kept.join(" ").replace(/\s+/g, " ").trim();
    if (!text || /^\[(BLANK_AUDIO|Music|MUSIC|music|Applause)\]$/.test(text)) continue;
    const prev = out[out.length - 1];
    const prevLast = prev ? (prev.text.match(/[^.!?。！？]+[.!?。！？]*/gu) ?? [prev.text]).at(-1) ?? "" : "";
    if (prev && (norm(prev.text) === norm(text) || norm(prevLast) === norm(text))) { prev.end = s.end; continue; }
    out.push({ ...s, text });
  }
  return out;
}

/**
 * Transcribes a 16 kHz WAV. One file at a time; the model stays loaded between files.
 * language "auto": window-by-window, so a video that switches between e.g. Korean and English is
 * transcribed in the language actually spoken in each part (whisper.cpp otherwise detects the language
 * once, from the first 30 s, and forces it on the whole file).
 */
export function transcribeWav(
  wav: string,
  opts: { model: WhisperModel; language: string; onProgress?: (pct: number) => void; onSegments?: (segs: Segment[]) => void },
): WhisperRun {
  let stopFn: (() => Promise<void>) | null = null;
  let stopped = false;
  const job = async () => {
    clearTimeout(g.__whisperIdle);
    if (stopped) return { segments: [], language: null, languages: [] };
    const ctx = await context(opts.model);
    const conv = (s: { text: string; t0: number; t1: number }): Segment => ({ start: s.t0, end: s.t1, text: s.text.trim() });
    const base = {
      maxThreads: Math.max(2, Math.min(8, os.availableParallelism?.() ?? os.cpus().length)),
      temperature: 0,
      temperatureInc: 0.2, // retry at higher temperature when the output looks repetitive
      maxContext: 0, // don't condition on previous text: the main cause of runaway repetition loops
    };
    try {
      if (opts.language !== "auto") {
        const live: Segment[] = [];
        const { stop, promise } = ctx.transcribeFile(wav, {
          ...base, language: opts.language,
          onProgress: (p) => opts.onProgress?.(Math.max(0, Math.min(100, p))),
          onNewSegments: (r) => { live.push(...r.segments.map(conv).filter((x) => x.text)); opts.onSegments?.(cleanLoops(live)); },
        });
        stopFn = stop;
        if (stopped) await stop();
        const r = await promise;
        return { segments: cleanLoops(r.segments.map(conv)), language: r.language ?? opts.language, languages: [opts.language] };
      }

      const total = wavDurationMs(wav);
      const chunks = planChunks(total, await silences(wav));
      const all: Segment[] = [];
      const langTime = new Map<string, number>();
      for (let i = 0; i < chunks.length; i++) {
        if (stopped) break;
        const c = chunks[i];
        const { stop, promise } = ctx.transcribeFile(wav, {
          ...base, language: "auto", offset: c.start, duration: c.end - c.start,
          onProgress: (p) => opts.onProgress?.(((i + Math.max(0, Math.min(100, p)) / 100) / chunks.length) * 100),
        });
        stopFn = stop;
        const r = await promise;
        const segs = r.segments.map(conv)
          .map((x) => ({ ...x, start: Math.max(c.start, Math.min(x.start, c.end)), end: Math.max(c.start, Math.min(x.end, c.end)) }))
          .filter((x) => x.text);
        if (segs.length && r.language) langTime.set(r.language, (langTime.get(r.language) ?? 0) + (c.end - c.start));
        all.push(...segs);
        opts.onSegments?.(cleanLoops(all));
        opts.onProgress?.(((i + 1) / chunks.length) * 100);
      }
      const languages = [...langTime.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
      return { segments: cleanLoops(all), language: languages[0] ?? null, languages };
    } finally {
      scheduleRelease();
    }
  };
  const p = (g.__whisperQueue ?? Promise.resolve()).then(job, job);
  g.__whisperQueue = p.catch(() => undefined);
  return { promise: p, stop: () => { stopped = true; void stopFn?.(); } };
}
