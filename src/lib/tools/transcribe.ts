// Transcript jobs: YouTube/site captions when available (instant), local Whisper otherwise.
// Finished transcripts are saved to .tools/transcripts/ so they survive restarts.
import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TOOLS_DIR, WORK_DIR, run } from "./bin";
import { parseCaptions } from "./captions";
import { ToolError, baseArgs, captionLangs, lastError, parseUrl, rawInfo, ytDlpPath, type RawInfo } from "./media";
import { BROWSERS, LANGUAGES, WHISPER_MODELS, type Browser, type Segment, type TranscriptJob, type TranscriptMethod, type WhisperModel } from "./shared";
import { isInstalled, toWav, transcribeWav } from "./whisper";

const SAVED_DIR = path.join(TOOLS_DIR, "transcripts");

export interface TranscribeOptions {
  method: TranscriptMethod;
  language: string; // "auto" or ISO code
  model: WhisperModel;
  cookies: Browser | null;
}

interface Internal { job: TranscriptJob; opts: TranscribeOptions; dir: string; input: string | null; cancel: (() => void) | null }
const g = globalThis as unknown as { __transcripts?: Map<string, Internal>; __transcriptsLoaded?: boolean };

function store() {
  const m = (g.__transcripts ??= new Map<string, Internal>());
  if (!g.__transcriptsLoaded) {
    g.__transcriptsLoaded = true;
    try {
      for (const f of fs.readdirSync(SAVED_DIR)) {
        if (!f.endsWith(".json")) continue;
        try {
          const job = JSON.parse(fs.readFileSync(path.join(SAVED_DIR, f), "utf8")) as TranscriptJob;
          if (job?.id && !m.has(job.id)) m.set(job.id, { job, opts: defaults(), dir: "", input: null, cancel: null });
        } catch { /* skip unreadable */ }
      }
    } catch { /* none saved yet */ }
  }
  return m;
}

const defaults = (): TranscribeOptions => ({ method: "auto", language: "auto", model: "turbo", cookies: null });

export function parseOptions(src: Record<string, unknown> | URLSearchParams): TranscribeOptions {
  const get = (k: string) => (src instanceof URLSearchParams ? src.get(k) : (src[k] as string | undefined)) ?? undefined;
  const method = get("method");
  const lang = get("language") ?? "auto";
  const model = get("model");
  const cookies = get("cookies");
  return {
    method: method === "captions" || method === "whisper" ? method : "auto",
    language: LANGUAGES.some(([c]) => c === lang) || /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(lang) ? lang : "auto",
    model: model && model in WHISPER_MODELS ? (model as WhisperModel) : "turbo",
    cookies: BROWSERS.includes(cookies as Browser) ? (cookies as Browser) : null,
  };
}

const summary = (j: TranscriptJob): TranscriptJob => ({ ...j, segments: undefined });

export function listTranscripts() {
  return [...store().values()].map((i) => summary(i.job)).sort((a, b) => b.createdAt - a.createdAt);
}

export function getTranscript(id: string) {
  const i = store().get(id);
  return i ? { ...i.job } : null;
}

export function removeTranscript(id: string) {
  const i = store().get(id);
  if (!i) return false;
  if (i.cancel) { i.job.status = "canceled"; i.cancel(); }
  store().delete(id);
  fs.rmSync(path.join(SAVED_DIR, `${id}.json`), { force: true });
  if (i.dir) setTimeout(() => fs.rmSync(i.dir, { recursive: true, force: true }), 1500);
  return true;
}

function newJob(source: TranscriptJob["source"], url: string | null, title: string, opts: TranscribeOptions, input: string | null, dir: string, id: string): TranscriptJob {
  const job: TranscriptJob = {
    id, source, url, title, thumbnail: null, duration: null, status: "queued", stage: "Waiting", percent: 0,
    method: null, captionKind: null, language: null, model: null, words: 0, preview: "", error: null,
    createdAt: Date.now(), finishedAt: null, tookMs: null, segments: [],
  };
  store().set(id, { job, opts, dir, input, cancel: null });
  void work(id);
  return summary(job);
}

export function createLinkJob(rawUrl: unknown, opts: TranscribeOptions, hint?: { title?: unknown; thumbnail?: unknown }) {
  const url = parseUrl(rawUrl);
  ytDlpPath();
  const id = randomUUID().slice(0, 12);
  const job = newJob("link", url, typeof hint?.title === "string" ? hint.title.slice(0, 300) : url, opts, null, path.join(WORK_DIR, `t-${id}`), id);
  const i = store().get(id)!;
  if (typeof hint?.thumbnail === "string" && /^https?:\/\//.test(hint.thumbnail)) i.job.thumbnail = hint.thumbnail;
  return { ...job, thumbnail: i.job.thumbnail };
}

/** Streams an uploaded file to disk, then queues it for Whisper. */
export async function createFileJob(body: ReadableStream<Uint8Array>, fileName: string, opts: TranscribeOptions) {
  const id = randomUUID().slice(0, 12);
  const dir = path.join(WORK_DIR, `t-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(fileName).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "upload";
  const input = path.join(dir, `in-${safe}`);
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), fs.createWriteStream(input));
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return newJob("file", null, safe.replace(/\.[^.]+$/, ""), { ...opts, method: "whisper" }, input, dir, id);
}

// ─── The work ───────────────────────────────────────────────────────────────
const running = { n: 0 };

async function work(id: string) {
  const i = store().get(id);
  if (!i) return;
  const { job, opts } = i;
  const started = Date.now();
  const set = (p: Partial<TranscriptJob>) => Object.assign(job, p);
  running.n++;
  try {
    fs.mkdirSync(i.dir, { recursive: true });
    let segments: Segment[] | null = null;

    if (job.source === "link" && job.url) {
      set({ status: "fetching", stage: "Reading video info", percent: 2 });
      const info = await rawInfo(job.url, opts.cookies);
      if (cancelled(job)) return;
      set({
        title: info.title ?? job.title, thumbnail: info.thumbnail ?? job.thumbnail, duration: info.duration ?? null,
      });

      if (opts.method !== "whisper") {
        const track = pickTrack(info, opts.language);
        if (track) {
          set({ stage: `Downloading ${track.kind === "manual" ? "subtitles" : "auto-captions"}`, percent: 10 });
          segments = await fetchCaptions(i, track);
          if (segments?.length) set({ method: "captions", captionKind: track.kind, language: track.lang.replace(/-orig$/, "") });
          else segments = null;
        }
        if (!segments && opts.method === "captions") {
          throw new ToolError("This video has no captions in that language. Switch Method to Whisper to transcribe the audio.");
        }
      }

      if (!segments) {
        requireModel(opts.model);
        set({ stage: "Downloading audio", percent: 5 });
        i.input = await downloadAudio(i);
      }
    }
    if (cancelled(job)) return;

    if (!segments) {
      requireModel(opts.model);
      set({ status: "transcribing", stage: "Preparing audio", percent: 0 });
      const wav = path.join(i.dir, "audio-16k.wav");
      await toWav(i.input!, wav);
      if (cancelled(job)) return;
      set({ stage: `Transcribing with Whisper ${WHISPER_MODELS[opts.model].label}`, model: opts.model, method: "whisper" });
      const runW = transcribeWav(wav, {
        model: opts.model, language: opts.language,
        onProgress: (p) => { job.percent = Math.round(p); },
        onSegments: (segs) => { job.segments = segs; job.preview = preview(segs); job.words = countWords(segs); },
      });
      i.cancel = runW.stop;
      const r = await runW.promise;
      i.cancel = null;
      if (cancelled(job)) return;
      segments = r.segments;
      set({ language: r.language ?? (opts.language === "auto" ? null : opts.language), languages: r.languages });
    }

    if (!segments.length) throw new ToolError("No speech found in this audio.");
    set({
      status: "done", stage: "Ready", percent: 100, segments, words: countWords(segments), preview: preview(segments),
      finishedAt: Date.now(), tookMs: Date.now() - started,
    });
    fs.mkdirSync(SAVED_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAVED_DIR, `${id}.json`), JSON.stringify(job));
  } catch (e) {
    if (!cancelled(job)) set({ status: "error", stage: "Failed", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
  } finally {
    running.n--;
    i.cancel = null;
    if (i.dir) fs.rmSync(i.dir, { recursive: true, force: true }); // audio isn't kept, only the text
  }
}

const cancelled = (j: TranscriptJob) => j.status === "canceled";

function requireModel(m: WhisperModel) {
  if (!isInstalled(m)) throw new ToolError(`Whisper needs the ${WHISPER_MODELS[m].label} model. Download it in the Whisper models box below, then try again.`);
}

const countWords = (segs: Segment[]) => segs.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0);
const preview = (segs: Segment[]) => segs.map((s) => s.text).join(" ").slice(0, 220);

/** Uploaded subtitles first, then auto-captions in the original language. */
function pickTrack(info: RawInfo, language: string): { lang: string; kind: "manual" | "auto"; auto: boolean } | null {
  const { manual, auto } = captionLangs(info);
  const autoKeys = Object.keys(info.automatic_captions ?? {});
  const want = language === "auto" ? (info.language ?? null) : language;
  const match = (list: string[], l: string | null) => (l ? list.find((k) => k === l) ?? list.find((k) => k.split("-")[0] === l) : undefined);

  const m = match(manual, want) ?? (language === "auto" ? (manual.length === 1 ? manual[0] : match(manual, "en")) : undefined);
  if (m) return { lang: m, kind: "manual", auto: false };
  // auto-captions: the "-orig" track is the real speech-recognised one; the rest are machine translations
  const origKey = (l: string) => autoKeys.find((k) => k === `${l}-orig`) ?? autoKeys.find((k) => k === l);
  if (want && auto.includes(want)) { const k = origKey(want); if (k) return { lang: k, kind: "auto", auto: true }; }
  if (language === "auto" && auto.length) { const k = origKey(auto[0]); if (k) return { lang: k, kind: "auto", auto: true }; }
  if (language !== "auto" && autoKeys.includes(language)) return { lang: language, kind: "auto", auto: true }; // translated auto-captions
  return null;
}

async function fetchCaptions(i: Internal, track: { lang: string; auto: boolean }): Promise<Segment[] | null> {
  const args = [
    ...(await baseArgs(i.opts.cookies)), "--skip-download", track.auto ? "--write-auto-subs" : "--write-subs",
    "--sub-langs", track.lang, "--sub-format", "vtt/srt/best", "-o", "captions", "--", i.job.url!,
  ];
  const r = await run(ytDlpPath(), args, { timeoutMs: 120_000, cwd: i.dir });
  if (r.code !== 0) throw new ToolError(lastError(r.stderr));
  const file = fs.readdirSync(i.dir).find((f) => f.startsWith("captions.") && /\.(vtt|srt)$/i.test(f));
  if (!file) return null;
  return parseCaptions(fs.readFileSync(path.join(i.dir, file), "utf8"));
}

/** Best audio-only stream (falls back to the full video), with download progress. */
function downloadAudio(i: Internal): Promise<string> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const args = [
        ...(await baseArgs(i.opts.cookies)), "-f", "ba/b", "--newline", "--progress",
        "--progress-template", "download:@@P %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
        "--no-part", "-o", "audio.%(ext)s", "--", i.job.url!,
      ];
      const child = spawn(ytDlpPath(), args, { cwd: i.dir, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      i.cancel = () => child.kill();
      let stderr = "", buf = "";
      child.stdout.on("data", (d) => {
        buf += d;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const l of lines) {
          const m = l.match(/^@@P (\S+)\|(\S+)\|(\S+)/);
          if (!m) continue;
          const pct = Number(m[1]) / (Number(m[2]) || Number(m[3]));
          if (Number.isFinite(pct)) i.job.percent = Math.round(Math.min(1, pct) * 100);
        }
      });
      child.stderr.on("data", (d) => { stderr += d; if (stderr.length > 20_000) stderr = stderr.slice(-10_000); });
      child.on("error", (e) => reject(e));
      child.on("close", (code) => {
        i.cancel = null;
        if (cancelled(i.job)) return reject(new ToolError("canceled"));
        if (code !== 0) return reject(new ToolError(lastError(stderr)));
        const f = fs.readdirSync(i.dir).find((x) => x.startsWith("audio."));
        if (!f) return reject(new ToolError("yt-dlp finished but no audio was saved."));
        resolve(path.join(i.dir, f));
      });
    })().catch(reject);
  });
}
