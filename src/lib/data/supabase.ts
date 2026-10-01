import "server-only";
import type { Collab, CollabInput, Post, PostInput } from "../domain";
import { createClient } from "../supabase/server";
import type { Repo } from "./types";

// ─── Row mapping (snake_case in Postgres ↔ camelCase in the app) ────────────
type CollabRow = {
  id: string; name: string; color: string; platforms: string[]; monthly_quota: number;
  start_month: string; end_month: string | null; notes: string; archived: boolean; created_at: string;
};
type PostRow = {
  id: string; collab_id: string; title: string; platform: string; stage: Post["stage"];
  due_date: string | null; posted_at: string | null; url: string | null; notes: string; created_at: string;
};

const toCollab = (r: CollabRow): Collab => ({
  id: r.id, name: r.name, color: r.color, platforms: r.platforms ?? [], monthlyQuota: r.monthly_quota,
  startMonth: r.start_month, endMonth: r.end_month, notes: r.notes, archived: r.archived, createdAt: r.created_at,
});
const toPost = (r: PostRow): Post => ({
  id: r.id, collabId: r.collab_id, title: r.title, platform: r.platform, stage: r.stage,
  dueDate: r.due_date, postedAt: r.posted_at, url: r.url, notes: r.notes, createdAt: r.created_at,
});

function collabRow(p: Partial<CollabInput>) {
  const r: Record<string, unknown> = {};
  if (p.name !== undefined) r.name = p.name;
  if (p.color !== undefined) r.color = p.color;
  if (p.platforms !== undefined) r.platforms = p.platforms;
  if (p.monthlyQuota !== undefined) r.monthly_quota = p.monthlyQuota;
  if (p.startMonth !== undefined) r.start_month = p.startMonth;
  if (p.endMonth !== undefined) r.end_month = p.endMonth;
  if (p.notes !== undefined) r.notes = p.notes;
  if (p.archived !== undefined) r.archived = p.archived;
  return r;
}
function postRow(p: Partial<PostInput>) {
  const r: Record<string, unknown> = {};
  if (p.collabId !== undefined) r.collab_id = p.collabId;
  if (p.title !== undefined) r.title = p.title;
  if (p.platform !== undefined) r.platform = p.platform;
  if (p.stage !== undefined) r.stage = p.stage;
  if (p.dueDate !== undefined) r.due_date = p.dueDate;
  if (p.postedAt !== undefined) r.posted_at = p.postedAt;
  if (p.url !== undefined) r.url = p.url;
  if (p.notes !== undefined) r.notes = p.notes;
  return r;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const supabaseRepo: Repo = {
  async listCollabs() {
    const sb = await createClient();
    return check(await sb.from("collabs").select("*").order("created_at")).map(toCollab);
  },
  async getCollab(id) {
    const sb = await createClient();
    const row = check(await sb.from("collabs").select("*").eq("id", id).maybeSingle());
    return row ? toCollab(row as CollabRow) : null;
  },
  async createCollab(input) {
    const sb = await createClient();
    return toCollab(check(await sb.from("collabs").insert(collabRow(input)).select().single()));
  },
  async updateCollab(id, patch) {
    const sb = await createClient();
    check(await sb.from("collabs").update(collabRow(patch)).eq("id", id));
  },
  async deleteCollab(id) {
    const sb = await createClient();
    check(await sb.from("collabs").delete().eq("id", id));
  },
  async listPosts() {
    // Personal scale (hundreds of rows) — fetching everything keeps the logic simple.
    const sb = await createClient();
    return check(await sb.from("posts").select("*").order("due_date", { nullsFirst: false })).map(toPost);
  },
  async getPost(id) {
    const sb = await createClient();
    const row = check(await sb.from("posts").select("*").eq("id", id).maybeSingle());
    return row ? toPost(row as PostRow) : null;
  },
  async createPost(input) {
    const sb = await createClient();
    return toPost(check(await sb.from("posts").insert(postRow(input)).select().single()));
  },
  async updatePost(id, patch) {
    const sb = await createClient();
    check(await sb.from("posts").update(postRow(patch)).eq("id", id));
  },
  async deletePost(id) {
    const sb = await createClient();
    check(await sb.from("posts").delete().eq("id", id));
  },
};
