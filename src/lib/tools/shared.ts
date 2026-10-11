// Types and constants shared by the tools' server code and their client UI (no Node imports here).

export const AUDIO_QUALITIES = ["320", "256", "192", "128"] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];

export const VIDEO_HEIGHTS = [2160, 1440, 1080, 720, 480, 360] as const;
export type VideoMode = "compatible" | "best";

export const BROWSERS = ["chrome", "safari", "firefox", "edge", "brave"] as const;
export type Browser = (typeof BROWSERS)[number];

export interface MediaInfo {
  url: string;
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  site: string | null;
  heights: number[];
  hasVideo: boolean;
  hasAudio: boolean;
  language: string | null;
  /** caption tracks: uploaded ("manual") and auto-generated in the original language */
  captions: { manual: string[]; auto: string[] };
}

export interface JobOptions {
  url: string;
  kind: "audio" | "video";
  audioQuality: AudioQuality;
  maxHeight: number | null;
  videoMode: VideoMode;
  cookies: Browser | null;
  title: string | null;
  thumbnail: string | null;
}

export type JobStatus = "queued" | "downloading" | "processing" | "done" | "error" | "canceled";

export interface MediaJob {
  id: string;
  kind: "audio" | "video";
  url: string;
  title: string;
  thumbnail: string | null;
  label: string;
  status: JobStatus;
  stage: string;
  percent: number;
  part: number;
  speed: string | null;
  eta: string | null;
  fileName: string | null;
  size: number | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export function fmtDuration(s: number | null) {
  if (s == null || !Number.isFinite(s)) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtBytes(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

// ─── Transcripts ────────────────────────────────────────────────────────────
export const WHISPER_MODELS = {
  turbo: { file: "ggml-large-v3-turbo-q5_0.bin", label: "Large v3 Turbo", size: "≈574 MB", note: "Best accuracy for the speed. Recommended on the Mac mini." },
  small: { file: "ggml-small-q5_1.bin", label: "Small", size: "≈190 MB", note: "Lighter and faster on older laptops, less accurate." },
} as const;
export type WhisperModel = keyof typeof WHISPER_MODELS;

export interface ModelStatus {
  key: WhisperModel;
  label: string;
  size: string;
  note: string;
  installed: boolean;
  downloading: boolean;
  progress: number; // 0–100 while downloading
  error: string | null;
}

export type TranscriptMethod = "auto" | "captions" | "whisper";

/** Languages offered in the picker (Whisper understands ~100; these are the likely ones). */
export const LANGUAGES: [string, string][] = [
  ["auto", "Auto-detect (mixed OK)"], ["en", "English"], ["vi", "Vietnamese"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"],
  ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["ru", "Russian"], ["th", "Thai"], ["id", "Indonesian"], ["hi", "Hindi"],
];

export interface Segment { start: number; end: number; text: string } // milliseconds

export type TranscriptStatus = "queued" | "fetching" | "transcribing" | "done" | "error" | "canceled";

export interface TranscriptJob {
  id: string;
  source: "link" | "file";
  url: string | null;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  status: TranscriptStatus;
  stage: string;
  percent: number;
  /** how the text was produced */
  method: "captions" | "whisper" | null;
  captionKind: "manual" | "auto" | null;
  language: string | null;
  /** every language Whisper heard, most-spoken first (auto-detect mode) */
  languages?: string[];
  model: WhisperModel | null;
  words: number;
  preview: string;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  tookMs: number | null;
  /** only on the single-job endpoint */
  segments?: Segment[];
}

export function fmtStamp(ms: number, withMs = false, sep = ".") {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000), m = Math.floor((t % 3_600_000) / 60_000), s = Math.floor((t % 60_000) / 1000), x = t % 1000;
  const base = `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
  if (!withMs) return base;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(x).padStart(3, "0")}`;
}

export function toSrt(segs: Segment[]) {
  return segs.map((s, i) => `${i + 1}\n${fmtStamp(s.start, true, ",")} --> ${fmtStamp(s.end, true, ",")}\n${s.text}\n`).join("\n");
}
export function toVtt(segs: Segment[]) {
  return "WEBVTT\n\n" + segs.map((s) => `${fmtStamp(s.start, true)} --> ${fmtStamp(s.end, true)}\n${s.text}\n`).join("\n");
}

/** Readable paragraphs: break on a long pause, or every ~45 s once a sentence ends. */
export function toParagraphs(segs: Segment[]): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  let cur: { start: number; parts: string[]; end: number } | null = null;
  for (const s of segs) {
    const gap = cur ? s.start - cur.end : 0;
    const long = cur ? s.start - cur.start > 45_000 : false;
    const ended = cur ? /[.!?…。？！]["')\]]?$/.test(cur.parts.at(-1) ?? "") : false;
    if (!cur || gap > 2_500 || (long && ended) || s.start - (cur?.start ?? 0) > 90_000) {
      if (cur) out.push({ start: cur.start, text: cur.parts.join(" ") });
      cur = { start: s.start, parts: [], end: s.end };
    }
    cur.parts.push(s.text);
    cur.end = s.end;
  }
  if (cur) out.push({ start: cur.start, text: cur.parts.join(" ") });
  return out;
}

// ─── Compressors ────────────────────────────────────────────────────────────
/** How hard to squeeze a video when no target size is set. CRF values are for H.264 (x264). */
export const VIDEO_LEVELS = {
  light: { label: "Light", crf: 20, note: "Hard to tell apart from the original." },
  balanced: { label: "Balanced", crf: 24, note: "Good for posting. Usually 50–80% smaller." },
  strong: { label: "Strong", crf: 28, note: "Noticeably softer, much smaller." },
  max: { label: "Max", crf: 32, note: "Smallest file. Visible blur and blocks." },
} as const;
export type VideoLevel = keyof typeof VIDEO_LEVELS;

export const TARGET_PRESETS_MB = [8, 10, 25, 50, 100] as const;
export const SHORT_SIDES = [1080, 720, 480] as const;

export interface VideoCompressOptions {
  mode: "quality" | "size";
  level: VideoLevel;
  targetMB: number;
  /** cap on the shorter side (1080 = "1080p" for both landscape and vertical); null = keep */
  shortSide: number | null;
  fps: 30 | 24 | null;
  codec: "h264" | "hevc";
  audio: "128" | "64" | "none";
  speed: "fast" | "balanced" | "thorough";
}

export interface VideoCodecs {
  h264: string | null; // encoder name, e.g. "libx264" or "h264_videotoolbox"
  hevc: string | null;
}

export type CompressStatus = "queued" | "compressing" | "done" | "error" | "canceled";

export interface CompressJob {
  id: string;
  name: string;
  fileName: string | null; // output file name
  label: string;
  status: CompressStatus;
  stage: string;
  percent: number;
  eta: number | null; // seconds
  inputSize: number;
  outputSize: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  outWidth: number | null;
  outHeight: number | null;
  hasThumb: boolean;
  /** the result came out bigger than the original (the source was already efficient) */
  bigger: boolean;
  /** a note about something the compressor changed on its own (e.g. lowered the resolution to hit the size) */
  note: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  tookMs: number | null;
}

export const IMAGE_FORMATS = ["same", "jpeg", "webp", "avif", "png"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export const IMAGE_MAX_SIDES = [4096, 2560, 1920, 1280, 1080, 720] as const;

export function pctSaved(before: number, after: number) {
  if (!before) return 0;
  return Math.round((1 - after / before) * 100);
}
