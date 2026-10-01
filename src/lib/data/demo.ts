// In-memory store used when Supabase isn't configured. Data resets when the dev server restarts.
import "server-only";
import type { Collab, CollabInput, Post, PostInput } from "../domain";
import { addDays, addMonths, firstDay, monthOf } from "../dates";
import { today as getToday } from "../env";
import type { Repo } from "./types";

type Store = { collabs: Collab[]; posts: Post[] };
const g = globalThis as unknown as { __hubDemo?: Store };

let seq = 0;
const id = () => `demo-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const clamp = (m: string, d: number) => {
  // day d of month m, clamped to month length
  const iso = addDays(firstDay(m), d - 1);
  return monthOf(iso) === m ? iso : addDays(firstDay(addMonths(m, 1)), -1);
};

function seed(): Store {
  const today = getToday();
  const m = monthOf(today);
  const prev = addMonths(m, -1);
  const now = new Date().toISOString();
  const c = (name: string, color: string, platforms: string[], quota: number): Collab => ({
    id: id(), name, color, platforms, monthlyQuota: quota, startMonth: prev, endMonth: null,
    notes: "", archived: false, createdAt: now,
  });
  const lumen = c("Lumen AI", "#7B4B94", ["Instagram", "TikTok"], 6);
  const kiroo = c("Kiroo", "#B04A63", ["TikTok", "YT Shorts"], 4);
  const pixel = c("Pixelforge", "#3F5BA9", ["Instagram", "X"], 3);
  const north = c("Northwind Audio", "#1F7A74", ["Instagram"], 2);
  lumen.notes = "Barter deal — credits. Tag @lumen.ai and #MadeWithLumen.";

  const p = (col: Collab, title: string, platform: string, stage: Post["stage"], day: number, url = true, month = m): Post => {
    const date = clamp(month, day);
    return {
      id: id(), collabId: col.id, title, platform, stage,
      dueDate: date, postedAt: stage === "posted" ? date : null,
      url: stage === "posted" && url ? `https://instagram.com/p/${Math.random().toString(36).slice(2, 10)}` : null,
      notes: "", createdAt: now,
    };
  };
  const t = Number(today.slice(8, 10));
  const past = (n: number) => Math.max(1, Math.min(t, n)); // keep "posted" days in the past
  return {
    collabs: [lumen, kiroo, pixel, north],
    posts: [
      // previous month — mostly delivered
      ...[3, 9, 15, 20, 26].map((d, i) => p(lumen, `Lumen demo ${i + 1}`, i % 2 ? "TikTok" : "IG Reel", "posted", d, true, prev)),
      ...[5, 14, 22, 28].map((d, i) => p(kiroo, `Kiroo short ${i + 1}`, "TikTok", "posted", d, true, prev)),
      ...[8, 19, 27].map((d, i) => p(pixel, `Pixelforge post ${i + 1}`, "IG Post", "posted", d, true, prev)),
      ...[10, 24].map((d, i) => p(north, `Northwind reel ${i + 1}`, "IG Reel", "posted", d, true, prev)),
      // this month
      p(lumen, "Robot chef reel", "IG Reel", "posted", past(3)),
      p(lumen, "Before / after edit", "TikTok", "posted", past(9)),
      p(lumen, "Prompt breakdown", "IG Reel", "posted", past(15), false),
      p(lumen, "Style transfer demo", "TikTok", "posted", past(22)),
      p(lumen, "Tutorial pt.1", "IG Reel", "ready", t + 1),
      p(lumen, "Behind the scenes", "TikTok", "draft", t + 2),
      p(kiroo, "Unboxing short", "TikTok", "posted", past(6)),
      p(kiroo, "Day-in-the-life", "YT Shorts", "posted", past(18)),
      p(kiroo, "Feature speedrun", "TikTok", "ready", Math.max(1, t - 1)),
      p(kiroo, "Comparison: old vs new", "YT Shorts", "idea", t + 2),
      p(pixel, "Texture pack showcase", "IG Post", "posted", past(8)),
      p(pixel, "Thread: my workflow", "X", "posted", past(20)),
      p(pixel, "Carousel: 5 tricks", "IG Post", "ready", t + 1),
      p(north, "Soundtrack teaser", "IG Reel", "posted", past(10)),
      p(north, "Studio session", "IG Reel", "posted", past(24)),
    ],
  };
}

const store = () => (g.__hubDemo ??= seed());

export const demoRepo: Repo = {
  async listCollabs() { return [...store().collabs]; },
  async getCollab(cid) { return store().collabs.find((c) => c.id === cid) ?? null; },
  async createCollab(input: CollabInput) {
    const c: Collab = { ...input, id: id(), createdAt: new Date().toISOString() };
    store().collabs.push(c);
    return c;
  },
  async updateCollab(cid, patch) {
    const c = store().collabs.find((x) => x.id === cid);
    if (c) Object.assign(c, patch);
  },
  async deleteCollab(cid) {
    const s = store();
    s.collabs = s.collabs.filter((c) => c.id !== cid);
    s.posts = s.posts.filter((p) => p.collabId !== cid);
  },
  async listPosts() { return [...store().posts]; },
  async getPost(pid) { return store().posts.find((p) => p.id === pid) ?? null; },
  async createPost(input: PostInput) {
    const p: Post = { ...input, id: id(), createdAt: new Date().toISOString() };
    store().posts.push(p);
    return p;
  },
  async updatePost(pid, patch) {
    const p = store().posts.find((x) => x.id === pid);
    if (p) Object.assign(p, patch);
  },
  async deletePost(pid) {
    const s = store();
    s.posts = s.posts.filter((p) => p.id !== pid);
  },
};
