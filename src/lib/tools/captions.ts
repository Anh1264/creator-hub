// Parses WebVTT / SRT caption files into clean segments. Handles YouTube's auto-captions, where each cue
// repeats the previous line and adds a new one with per-word timing tags ("rolling" captions).
import type { Segment } from "./shared";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function clean(line: string) {
  return line
    .replace(/<[^>]+>/g, "") // <c>, <00:00:01.234>, <i>, <v Speaker>
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m))
    .replace(/\s+/g, " ")
    .trim();
}

function toMs(stamp: string) {
  const m = stamp.trim().replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return NaN;
  const [, h = "0", min, s, frac = "0"] = m;
  return ((Number(h) * 60 + Number(min)) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, "0"));
}

export function parseCaptions(raw: string): Segment[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const segs: Segment[] = [];
  let last = "";
  for (const block of blocks) {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue; // WEBVTT header, NOTE, STYLE, numeric-only blocks
    const [a, b] = lines[ti].split("-->");
    const start = toMs(a), end = toMs(b.trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (const l of lines.slice(ti + 1)) {
      const t = clean(l);
      if (!t || t === last) continue;
      last = t;
      segs.push({ start, end: Math.max(end, start), text: t });
    }
  }
  // Rolling captions give tiny cues; stitch each line's end to the next line's start.
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].end > segs[i + 1].start || segs[i].end - segs[i].start < 200) segs[i].end = Math.max(segs[i].start, segs[i + 1].start);
  }
  return segs;
}
