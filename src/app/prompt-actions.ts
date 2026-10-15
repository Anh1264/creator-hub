"use server";
// Prompt library mutations. Every action re-checks auth.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { repo } from "@/lib/data";
import { listAssets } from "@/lib/media/assets";
import { housekeeping } from "@/lib/media/housekeeping";
import { deletePrompt as del, getPrompt, setFavorite, upsertPrompt } from "@/lib/prompts/store";
import { cleanUrl, parseLabels, platformOf, type PromptEntry } from "@/lib/prompts/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const refresh = () => revalidatePath("/prompts", "layout");

export async function savePrompt(input: PromptEntry): Promise<Result<{ id: string }>> {
  await requireUser();
  const collabIds = new Set((await repo.listCollabs()).map((c) => c.id));
  const assetIds = (await listAssets((input.assetIds ?? []).slice(0, 30))).map((a) => a.id);
  const links: PromptEntry["links"] = [];
  for (const l of input.links ?? []) {
    const url = cleanUrl(clip(l?.url, 2000));
    if (url && !links.some((x) => x.url === url)) links.push({ url, platform: platformOf(url) });
  }
  const entry: PromptEntry = {
    id: clip(input.id, 40),
    title: clip(input.title, 200).trim(),
    kind: input.kind === "image" ? "image" : "video",
    model: clip(input.model, 80).trim(),
    prompt: clip(input.prompt, 50_000),
    negative: clip(input.negative, 10_000),
    links: links.slice(0, 30),
    assetIds,
    tags: parseLabels((input.tags ?? []).join(",")),
    collabIds: (input.collabIds ?? []).filter((id) => collabIds.has(id)),
    notes: clip(input.notes, 20_000),
    favorite: !!input.favorite,
    createdAt: "", updatedAt: "",
  };
  if (!entry.prompt.trim()) return { ok: false, error: "Paste the prompt first." };
  if (!entry.title) entry.title = entry.prompt.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80);
  if (entry.id && !(await getPrompt(entry.id))) return { ok: false, error: "That prompt was deleted." };
  const saved = await upsertPrompt(entry);
  void housekeeping();
  refresh();
  return { ok: true, data: { id: saved.id } };
}

export async function deletePrompt(id: string): Promise<Result> {
  await requireUser();
  await del(id);
  refresh();
  return { ok: true };
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<Result> {
  await requireUser();
  await setFavorite(id, favorite);
  refresh();
  return { ok: true };
}

/** "New version": a copy to iterate on, keeping the prompt, model, tags and collabs but not links or media. */
export async function newVersion(id: string): Promise<Result<{ id: string }>> {
  await requireUser();
  const src = await getPrompt(id);
  if (!src) return { ok: false, error: "Not found." };
  const m = /\(v(\d+)\)$/.exec(src.title);
  const title = m ? src.title.replace(/\(v\d+\)$/, `(v${Number(m[1]) + 1})`) : `${src.title} (v2)`;
  const saved = await upsertPrompt({ ...structuredClone(src), id: "", title, links: [], assetIds: [], favorite: false });
  refresh();
  return { ok: true, data: { id: saved.id } };
}
