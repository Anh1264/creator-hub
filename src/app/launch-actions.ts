"use server";
// Launchpad + Characters album mutations. Every action re-checks auth.
import { revalidatePath } from "next/cache";
import { requireUser, userToday } from "@/lib/auth";
import { repo } from "@/lib/data";
import {
  addToAlbum as addPics, deleteItem as delItem, deleteSet as delSet, duplicateItem as dup, getItem, patchPlatform,
  removeFromAlbum as removePic, saveSet as putSet, setProgramTags as putTags, upsertItem,
} from "@/lib/launch/store";
import { listAssets } from "@/lib/media/assets";
import { housekeeping } from "@/lib/media/housekeeping";
import { PLATFORMS, PLATFORM_META, parseTags, type PlatformKey, type QueueItem } from "@/lib/launch/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const refresh = () => revalidatePath("/", "layout");
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const isLocalDT = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);

function cleanUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).toString(); } catch { return null; }
}

export async function saveItem(input: QueueItem): Promise<Result<{ id: string }>> {
  await requireUser();
  const collabs = await repo.listCollabs();
  const item: QueueItem = {
    ...input,
    title: clip(input.title, 200).trim(),
    notes: clip(input.notes, 4000),
    caption: clip(input.caption, 70_000),
    hashtags: parseTags((input.hashtags ?? []).join(" ")).slice(0, 60),
    firstComment: clip(input.firstComment, 3000),
    link: clip(input.link, 500).trim(),
    assetIds: (await listAssets((input.assetIds ?? []).slice(0, 20))).map((a) => a.id),
    collabIds: (input.collabIds ?? []).filter((id) => collabs.some((c) => c.id === id)),
    characterIds: (input.characterIds ?? []).filter((x) => typeof x === "string"),
    ready: !!input.ready,
  };
  for (const p of PLATFORMS) {
    const pl = input.platforms?.[p];
    if (!pl) return fail("Platform settings missing.");
    if (pl.scheduledAt && !isLocalDT(pl.scheduledAt)) return fail(`${PLATFORM_META[p].label}: the time looks wrong.`);
    item.platforms[p] = {
      ...pl,
      caption: pl.caption === null ? null : clip(pl.caption, 70_000),
      hashtags: pl.hashtags === null ? null : parseTags(pl.hashtags.join(" ")).slice(0, 60),
      scheduledAt: pl.scheduledAt || null,
    };
  }
  if (!item.title && !item.caption && !item.assetIds.length) return fail("Add a title, a caption or some media first.");
  if (!item.title) item.title = item.caption.split("\n")[0].slice(0, 80) || "Untitled post";
  const saved = await upsertItem(item);
  void housekeeping();
  refresh();
  return { ok: true, data: { id: saved.id } };
}

export async function deleteItem(id: string): Promise<Result> {
  await requireUser();
  await delItem(id);
  refresh();
  return { ok: true };
}

export async function duplicateItem(id: string): Promise<Result<{ id: string }>> {
  await requireUser();
  const copy = await dup(id);
  if (!copy) return fail("Post not found.");
  refresh();
  return { ok: true, data: { id: copy.id } };
}

/**
 * Marks one platform as posted. With a collab attached, it also logs a posted entry against each collab's
 * monthly quota (with the live link as proof). Undo removes those entries again.
 */
export async function setPosted(id: string, p: PlatformKey, posted: boolean, rawUrl = ""): Promise<Result> {
  await requireUser();
  const item = await getItem(id);
  if (!item || !PLATFORMS.includes(p)) return fail("Post not found.");
  const today = await userToday();
  const url = cleanUrl(rawUrl);
  if (rawUrl.trim() && !url) return fail("That link doesn't look like a URL.");
  const plan = item.platforms[p];
  if (posted) {
    const logged: string[] = [];
    if (plan.status !== "posted") {
      for (const collabId of item.collabIds) {
        if (!(await repo.getCollab(collabId))) continue;
        const post = await repo.createPost({
          collabId, title: item.title, platform: PLATFORM_META[p].label, stage: "posted",
          dueDate: plan.scheduledAt?.slice(0, 10) ?? null, postedAt: today, url, notes: "From Launchpad",
        });
        logged.push(post.id);
      }
    } else {
      for (const pid of plan.loggedPostIds) await repo.updatePost(pid, { url });
    }
    await patchPlatform(id, p, {
      status: "posted", postedAt: plan.postedAt ?? new Date().toISOString(), url,
      loggedPostIds: plan.status === "posted" ? plan.loggedPostIds : logged,
    });
  } else {
    for (const pid of plan.loggedPostIds) await repo.deletePost(pid);
    await patchPlatform(id, p, { status: "pending", postedAt: null, url: null, loggedPostIds: [] });
  }
  refresh();
  return { ok: true };
}

export async function skipPlatform(id: string, p: PlatformKey, skip: boolean): Promise<Result> {
  await requireUser();
  if (!(await patchPlatform(id, p, { status: skip ? "skipped" : "pending" }))) return fail("Post not found.");
  refresh();
  return { ok: true };
}

export async function saveHashtagSet(input: { id?: string; name: string; tags: string }): Promise<Result> {
  await requireUser();
  const name = clip(input.name, 60).trim();
  const tags = parseTags(input.tags).slice(0, 60);
  if (!name || !tags.length) return fail("A set needs a name and at least one tag.");
  await putSet({ id: input.id ?? "", name, tags });
  refresh();
  return { ok: true };
}

export async function deleteHashtagSet(id: string): Promise<Result> {
  await requireUser();
  await delSet(id);
  refresh();
  return { ok: true };
}

export async function saveProgramTags(collabId: string, tags: string): Promise<Result> {
  await requireUser();
  if (!(await repo.getCollab(collabId))) return fail("Collab not found.");
  await putTags(collabId, parseTags(tags).slice(0, 20));
  refresh();
  return { ok: true };
}

// ─── Characters album ───────────────────────────────────────────────────────
export async function addToAlbum(assetIds: string[]): Promise<Result> {
  await requireUser();
  await addPics((await listAssets(assetIds ?? [])).map((a) => a.id));
  void housekeeping();
  refresh();
  return { ok: true };
}

export async function removeFromAlbum(assetId: string): Promise<Result> {
  await requireUser();
  await removePic(assetId);
  refresh();
  return { ok: true };
}
