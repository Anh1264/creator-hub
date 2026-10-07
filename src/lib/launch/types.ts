// Launchpad + Characters album: shared types, platform rules and caption helpers (client-safe, no Node imports).

export type PlatformKey = "x" | "ig" | "fb";
export const PLATFORMS: PlatformKey[] = ["x", "ig", "fb"];

/** Limits used by the checks. X Premium allows longer posts; 280 is the free-account limit. */
export const PLATFORM_META: Record<PlatformKey, {
  label: string; short: string; maxChars: number; maxHashtags: number | null; composeUrl: string; color: string;
}> = {
  x: { label: "X", short: "X", maxChars: 280, maxHashtags: null, composeUrl: "https://x.com/compose/post", color: "#2A2620" },
  ig: { label: "Instagram", short: "IG", maxChars: 2200, maxHashtags: 5, composeUrl: "https://www.instagram.com/", color: "#B04A63" },
  fb: { label: "Facebook", short: "FB", maxChars: 63206, maxHashtags: null, composeUrl: "https://www.facebook.com/", color: "#3F5BA9" },
};

export interface Asset {
  id: string;
  name: string;
  kind: "image" | "video" | "other";
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null; // seconds
  hasThumb: boolean;
  createdAt: string;
}

export type PlatformStatus = "pending" | "posted" | "skipped";

export interface PlatformPlan {
  enabled: boolean;
  /** null = use the main caption */
  caption: string | null;
  /** null = use the main hashtags */
  hashtags: string[] | null;
  /** IG: put hashtags in the first comment instead of the caption */
  tagsInComment: boolean;
  /** local time in APP_TIMEZONE, "YYYY-MM-DDTHH:mm" */
  scheduledAt: string | null;
  status: PlatformStatus;
  postedAt: string | null;
  url: string | null;
  /** id of the collab post created when this was marked posted */
  loggedPostIds: string[];
}

export interface QueueItem {
  id: string;
  title: string;
  notes: string;
  assetIds: string[];
  caption: string;
  hashtags: string[];
  firstComment: string;
  link: string;
  collabIds: string[];
  characterIds: string[];
  platforms: Record<PlatformKey, PlatformPlan>;
  ready: boolean; // false = still a draft
  createdAt: string;
  updatedAt: string;
}

export interface HashtagSet { id: string; name: string; tags: string[] }

/** Tags/mentions a program requires in captions, keyed by collab id. */
export type ProgramTags = Record<string, string[]>;

/** Characters album: just pictures, newest first. */
export interface AlbumEntry { assetId: string; addedAt: string }

// ─── Helpers ────────────────────────────────────────────────────────────────
export const emptyPlan = (enabled = true): PlatformPlan => ({
  enabled, caption: null, hashtags: null, tagsInComment: false, scheduledAt: null, status: "pending", postedAt: null, url: null, loggedPostIds: [],
});

/** "#a, b  #c" → ["#a", "#b", "#c"]; keeps @mentions as-is. */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const t of raw.split(/[\s,]+/)) {
    const v = t.trim();
    if (!v) continue;
    const tag = /^[#@]/.test(v) ? v : `#${v}`;
    if (!out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

export const hashtagsIn = (text: string) => text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.map((s) => s.trim()) ?? [];

/** X counts URLs as 23 characters and most emoji/CJK as 2. Close enough for a warning. */
export function xLength(text: string) {
  let n = 0;
  const withoutUrls = text.replace(/https?:\/\/\S+/g, () => { n += 23; return ""; });
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0)!;
    n += cp > 0x10ff && !(cp >= 0x2000 && cp <= 0x200d) && !(cp >= 0x2010 && cp <= 0x201f) ? 2 : 1;
  }
  return n;
}

export const charCount = (p: PlatformKey, text: string) => (p === "x" ? xLength(text) : [...text].length);

/** What actually gets pasted for a platform. */
export function compose(item: Pick<QueueItem, "caption" | "hashtags" | "firstComment" | "link">, p: PlatformKey, plan: PlatformPlan) {
  const caption = (plan.caption ?? item.caption).trim();
  const tags = plan.hashtags ?? item.hashtags;
  const tagLine = tags.join(" ");
  const link = item.link.trim();
  const inComment = p === "ig" && plan.tagsInComment;
  const parts = [caption];
  if (link && p !== "ig") parts.push(link); // IG captions don't make links clickable
  if (tagLine && !inComment) parts.push(tagLine);
  const text = parts.filter(Boolean).join("\n\n");
  const comment = [item.firstComment.trim(), inComment ? tagLine : ""].filter(Boolean).join("\n\n");
  return { text, comment, tags };
}

export interface Check { level: "error" | "warn"; msg: string }

export function checkPlatform(
  item: QueueItem, p: PlatformKey, required: string[],
): Check[] {
  const plan = item.platforms[p];
  if (!plan.enabled) return [];
  const meta = PLATFORM_META[p];
  const { text, comment, tags } = compose(item, p, plan);
  const out: Check[] = [];
  const len = charCount(p, text);
  if (!text) out.push({ level: "warn", msg: "Caption is empty." });
  if (len > meta.maxChars) out.push({ level: "error", msg: `${len}/${meta.maxChars} characters — too long${p === "x" ? " (unless you have X Premium)" : ""}.` });
  const tagCount = new Set([...tags.filter((t) => t.startsWith("#")), ...hashtagsIn(plan.caption ?? item.caption)].map((t) => t.toLowerCase())).size;
  if (meta.maxHashtags !== null && tagCount > meta.maxHashtags) out.push({ level: "error", msg: `${tagCount} hashtags — ${meta.label} allows ${meta.maxHashtags}.` });
  const everything = `${text}\n${comment}`.toLowerCase();
  const missing = required.filter((r) => !everything.includes(r.toLowerCase()));
  if (missing.length) out.push({ level: "error", msg: `Missing program tags: ${missing.join(" ")}` });
  if (!plan.scheduledAt) out.push({ level: "warn", msg: "No time set." });
  if (!item.assetIds.length) out.push({ level: "warn", msg: "No media attached." });
  return out;
}

/** "YYYY-MM-DDTHH:mm" now, in the given timezone. */
export function nowLocal(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

export function fmtWhen(s: string | null) {
  if (!s) return "No time";
  const [d, t] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const mon = new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const wd = new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${mon} ${day} · ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

export type ItemState = "draft" | "scheduled" | "due" | "partial" | "posted";

/** Overall state of a queue item at time `now` (local "YYYY-MM-DDTHH:mm"). */
export function itemState(item: QueueItem, now: string): ItemState {
  const plans = PLATFORMS.map((p) => item.platforms[p]).filter((p) => p.enabled);
  if (!plans.length || !item.ready) return "draft";
  const open = plans.filter((p) => p.status === "pending");
  if (!open.length) return "posted";
  if (open.some((p) => p.scheduledAt && p.scheduledAt <= now)) return "due";
  if (open.length < plans.length) return "partial";
  return "scheduled";
}

/** Earliest pending time across platforms (for sorting / grouping). */
export function nextTime(item: QueueItem) {
  const times = PLATFORMS.map((p) => item.platforms[p]).filter((p) => p.enabled && p.status === "pending" && p.scheduledAt).map((p) => p.scheduledAt!);
  return times.sort()[0] ?? null;
}
