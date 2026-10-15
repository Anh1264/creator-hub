// Cloud backend (Supabase, row level security) for the Launchpad queue, hashtag sets, program tags and
// the characters album. Rows are scoped to the signed-in user by RLS; inserts default user_id = auth.uid().
import "server-only";
import { deleteAssets } from "../media/assets";
import { createClient } from "../supabase/server";
import { PLATFORMS, emptyPlan, type AlbumEntry, type HashtagSet, type PlatformKey, type ProgramTags, type QueueItem } from "./types";

type ItemRow = {
  id: string; title: string; notes: string; caption: string; hashtags: string[]; first_comment: string; link: string;
  asset_ids: string[]; collab_ids: string[]; character_ids: string[]; platforms: QueueItem["platforms"]; ready: boolean;
  created_at: string; updated_at: string;
};

const toItem = (r: ItemRow): QueueItem => {
  const platforms = { ...r.platforms };
  for (const p of PLATFORMS) platforms[p] = { ...emptyPlan(false), ...(r.platforms?.[p] ?? {}) };
  return {
    id: r.id, title: r.title, notes: r.notes, caption: r.caption, hashtags: r.hashtags ?? [], firstComment: r.first_comment,
    link: r.link, assetIds: r.asset_ids ?? [], collabIds: r.collab_ids ?? [], characterIds: r.character_ids ?? [],
    platforms, ready: r.ready, createdAt: r.created_at, updatedAt: r.updated_at,
  };
};
const itemRow = (i: QueueItem) => ({
  title: i.title, notes: i.notes, caption: i.caption, hashtags: i.hashtags, first_comment: i.firstComment, link: i.link,
  asset_ids: i.assetIds, collab_ids: i.collabIds, character_ids: i.characterIds, platforms: i.platforms, ready: i.ready,
});

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ─── Queue ──────────────────────────────────────────────────────────────────
export async function listItems(): Promise<QueueItem[]> {
  const sb = await createClient();
  return check(await sb.from("launch_items").select("*").order("created_at")).map((r) => toItem(r as ItemRow));
}

export async function getItem(id: string): Promise<QueueItem | null> {
  if (!isUuid(id)) return null;
  const sb = await createClient();
  const row = check(await sb.from("launch_items").select("*").eq("id", id).maybeSingle());
  return row ? toItem(row as ItemRow) : null;
}

export async function upsertItem(input: QueueItem): Promise<QueueItem> {
  const sb = await createClient();
  if (input.id) {
    const existing = await getItem(input.id);
    if (existing) {
      const row = check(await sb.from("launch_items").update(itemRow(input)).eq("id", input.id).select().single());
      const removed = existing.assetIds.filter((a) => !input.assetIds.includes(a));
      if (removed.length) await deleteAssets(removed);
      return toItem(row as unknown as ItemRow);
    }
  }
  return toItem(check(await sb.from("launch_items").insert(itemRow(input)).select().single()) as ItemRow);
}

export async function deleteItem(id: string) {
  const item = await getItem(id);
  if (!item) return;
  const sb = await createClient();
  check(await sb.from("launch_items").delete().eq("id", id));
  await deleteAssets(item.assetIds);
}

export async function patchPlatform(id: string, p: PlatformKey, patch: Partial<QueueItem["platforms"][PlatformKey]>) {
  const item = await getItem(id);
  if (!item) return null;
  const platforms = { ...item.platforms, [p]: { ...item.platforms[p], ...patch } };
  const sb = await createClient();
  return toItem(check(await sb.from("launch_items").update({ platforms }).eq("id", id).select().single()) as ItemRow);
}

export async function duplicateItem(id: string) {
  const src = await getItem(id);
  if (!src) return null;
  const copy: QueueItem = structuredClone(src);
  copy.id = "";
  copy.title = `${src.title} (copy)`;
  copy.assetIds = []; // files aren't duplicated — reattach what you need
  for (const p of PLATFORMS) Object.assign(copy.platforms[p], { status: "pending", postedAt: null, url: null, loggedPostIds: [] });
  return upsertItem(copy);
}

// ─── Hashtag sets & program tags ────────────────────────────────────────────
export async function listSets(): Promise<HashtagSet[]> {
  const sb = await createClient();
  return check(await sb.from("hashtag_sets").select("id, name, tags").order("name")) as HashtagSet[];
}
export async function saveSet(set: HashtagSet) {
  const sb = await createClient();
  if (set.id && isUuid(set.id)) check(await sb.from("hashtag_sets").update({ name: set.name, tags: set.tags }).eq("id", set.id));
  else check(await sb.from("hashtag_sets").insert({ name: set.name, tags: set.tags }));
}
export async function deleteSet(id: string) {
  if (!isUuid(id)) return;
  const sb = await createClient();
  check(await sb.from("hashtag_sets").delete().eq("id", id));
}

/** Program tags, seeded once per user for programs we know the rules of (matched by collab name). */
export async function programTags(collabs: { id: string; name: string }[]): Promise<ProgramTags> {
  const sb = await createClient();
  const { data: profile } = await sb.from("profiles").select("id, program_tags_seeded").maybeSingle();
  if (profile && !profile.program_tags_seeded && collabs.length) {
    const seed = collabs.flatMap((c) => {
      const n = c.name.toLowerCase();
      if (n.includes("dreamina")) return [{ collab_id: c.id, tags: ["#DreaminaCPP", "@dreamina_cpp"] }];
      if (n.includes("pollo")) return [{ collab_id: c.id, tags: ["#PolloAI"] }];
      return [];
    });
    if (seed.length) await sb.from("program_tags").upsert(seed, { onConflict: "collab_id", ignoreDuplicates: true });
    await sb.from("profiles").update({ program_tags_seeded: true }).eq("id", profile.id);
  }
  const rows = check(await sb.from("program_tags").select("collab_id, tags")) as { collab_id: string; tags: string[] }[];
  return Object.fromEntries(rows.map((r) => [r.collab_id, r.tags]));
}
export async function setProgramTags(collabId: string, tags: string[]) {
  const sb = await createClient();
  if (tags.length) check(await sb.from("program_tags").upsert({ collab_id: collabId, tags }, { onConflict: "collab_id" }));
  else check(await sb.from("program_tags").delete().eq("collab_id", collabId));
}

// ─── Characters album ───────────────────────────────────────────────────────
export async function listAlbum(): Promise<AlbumEntry[]> {
  const sb = await createClient();
  const rows = check(await sb.from("album").select("asset_id, added_at").order("added_at", { ascending: false })) as { asset_id: string; added_at: string }[];
  return rows.map((r) => ({ assetId: r.asset_id, addedAt: r.added_at }));
}
export async function addToAlbum(assetIds: string[]) {
  if (!assetIds.length) return;
  const sb = await createClient();
  check(await sb.from("album").upsert(assetIds.map((asset_id) => ({ asset_id })), { onConflict: "asset_id", ignoreDuplicates: true }));
}
export async function removeFromAlbum(assetId: string) {
  const sb = await createClient();
  check(await sb.from("album").delete().eq("asset_id", assetId));
  await deleteAssets([assetId]);
}
