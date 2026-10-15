// Cloud backend (Supabase, row level security) for the prompt library.
import "server-only";
import { deleteAssets } from "../media/assets";
import { createClient } from "../supabase/server";
import type { PromptEntry } from "./types";

type Row = {
  id: string; title: string; kind: PromptEntry["kind"]; model: string; prompt: string; negative: string;
  links: PromptEntry["links"]; asset_ids: string[]; tags: string[]; collab_ids: string[]; notes: string; favorite: boolean;
  created_at: string; updated_at: string;
};
const toEntry = (r: Row): PromptEntry => ({
  id: r.id, title: r.title, kind: r.kind, model: r.model, prompt: r.prompt, negative: r.negative, links: r.links ?? [],
  assetIds: r.asset_ids ?? [], tags: r.tags ?? [], collabIds: r.collab_ids ?? [], notes: r.notes, favorite: r.favorite,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const toRow = (p: PromptEntry) => ({
  title: p.title, kind: p.kind, model: p.model, prompt: p.prompt, negative: p.negative, links: p.links,
  asset_ids: p.assetIds, tags: p.tags, collab_ids: p.collabIds, notes: p.notes, favorite: p.favorite,
});
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function listPrompts() {
  const sb = await createClient();
  return check(await sb.from("prompts").select("*").order("updated_at", { ascending: false })).map((r) => toEntry(r as Row));
}
export async function getPrompt(id: string) {
  if (!isUuid(id)) return null;
  const sb = await createClient();
  const row = check(await sb.from("prompts").select("*").eq("id", id).maybeSingle());
  return row ? toEntry(row as Row) : null;
}
export async function upsertPrompt(input: PromptEntry) {
  const sb = await createClient();
  const existing = input.id ? await getPrompt(input.id) : null;
  if (existing) {
    const row = check(await sb.from("prompts").update(toRow(input)).eq("id", input.id).select().single());
    const removed = existing.assetIds.filter((a) => !input.assetIds.includes(a));
    if (removed.length) await deleteAssets(removed);
    return toEntry(row as unknown as Row);
  }
  return toEntry(check(await sb.from("prompts").insert(toRow(input)).select().single()) as Row);
}
export async function deletePrompt(id: string) {
  const p = await getPrompt(id);
  if (!p) return;
  const sb = await createClient();
  check(await sb.from("prompts").delete().eq("id", id));
  await deleteAssets(p.assetIds);
}
/** Not a content edit: the prompts_touch trigger leaves updated_at (the list order) alone. */
export async function setFavorite(id: string, favorite: boolean) {
  if (!isUuid(id)) return;
  const sb = await createClient();
  check(await sb.from("prompts").update({ favorite }).eq("id", id));
}
