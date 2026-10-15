// Prompt library: the prompt behind each piece, the model it ran on, and where the result was posted.
// Shared by server and client (no Node imports).

export type LinkPlatform = "tiktok" | "instagram" | "youtube" | "x" | "facebook" | "threads" | "pollo" | "dreamina" | "other";

export const LINK_PLATFORMS: Record<LinkPlatform, { label: string; color: string }> = {
  tiktok: { label: "TikTok", color: "#2A2620" },
  instagram: { label: "Instagram", color: "#B04A63" },
  youtube: { label: "YouTube", color: "#C2412D" },
  x: { label: "X", color: "#2A2620" },
  facebook: { label: "Facebook", color: "#3F5BA9" },
  threads: { label: "Threads", color: "#2A2620" },
  pollo: { label: "Pollo", color: "#7A54B0" },
  dreamina: { label: "Dreamina", color: "#19788F" },
  other: { label: "Link", color: "#8B8478" },
};

export interface PromptLink { url: string; platform: LinkPlatform }

export interface PromptEntry {
  id: string;
  title: string;
  kind: "video" | "image";
  model: string;
  prompt: string;
  negative: string;
  /** where the finished piece was posted */
  links: PromptLink[];
  /** reference images, cover frame, or the result clip itself (stored like Launchpad media) */
  assetIds: string[];
  tags: string[];
  collabIds: string[];
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Suggestions only — the model field is free text. */
export const MODEL_SUGGESTIONS = [
  "Seedance 2.0", "Seedream 5.0", "Kling", "Veo", "Sora", "Hailuo", "Runway", "Wan", "Midjourney", "Nano Banana", "Pollo AI", "Dreamina",
];

export function platformOf(url: string): LinkPlatform {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\.|^m\./, ""); } catch { return "other"; }
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(host)) return "facebook";
  if (/(^|\.)threads\.(net|com)$/.test(host)) return "threads";
  if (/(^|\.)pollo\.ai$/.test(host)) return "pollo";
  if (/(^|\.)(dreamina\.capcut\.com|dreamina\.com)$/.test(host) || host.startsWith("dreamina.")) return "dreamina";
  return "other";
}

export function cleanUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch { return null; }
}

/** Free-form tags: "fight, anime  #seedance" → ["fight", "anime", "seedance"] */
export function parseLabels(raw: string): string[] {
  const out: string[] = [];
  for (const t of raw.split(/[,\n]+|\s+(?=#)/)) {
    const v = t.trim().replace(/^#/, "").slice(0, 40);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 20);
}

export const emptyPrompt = (): PromptEntry => ({
  id: "", title: "", kind: "video", model: "", prompt: "", negative: "", links: [], assetIds: [], tags: [], collabIds: [],
  notes: "", favorite: false, createdAt: "", updatedAt: "",
});
