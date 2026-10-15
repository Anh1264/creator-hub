// Local-mode backend for the Launchpad queue, hashtag sets, program tags and the characters album
// (.tools/data/*.json via ../local/db). The app uses ./store.ts, which picks this or the cloud backend.
import "server-only";
import { randomUUID } from "node:crypto";
import { load, save } from "../local/db";
import { deleteAssets } from "./assets";
import {
  PLATFORMS, emptyPlan, type AlbumEntry, type HashtagSet, type PlatformKey, type ProgramTags, type QueueItem,
} from "./types";

type LaunchDb = { items: QueueItem[]; sets: HashtagSet[]; programTags: ProgramTags; seededTags: boolean };
// characters.json held full character sheets before; only the pictures are kept now (album).
type CharDb = { album?: AlbumEntry[]; characters?: { assetIds?: string[]; createdAt?: string }[] };

const launch = () => load<LaunchDb>("launchpad", () => ({ items: [], sets: [], programTags: {}, seededTags: false }));
const chars = () => load<CharDb>("characters", () => ({ album: [] }));
const uid = () => randomUUID().replace(/-/g, "").slice(0, 12);
const now = () => new Date().toISOString();

// ─── Queue ──────────────────────────────────────────────────────────────────
export const listItems = () => [...launch().items];
export const getItem = (id: string) => launch().items.find((i) => i.id === id) ?? null;

export function newItem(): QueueItem {
  return {
    id: "", title: "", notes: "", assetIds: [], caption: "", hashtags: [], firstComment: "", link: "",
    collabIds: [], characterIds: [], ready: false, createdAt: "", updatedAt: "",
    platforms: { x: emptyPlan(), ig: emptyPlan(), fb: emptyPlan() },
  };
}

export function upsertItem(input: QueueItem): QueueItem {
  const db = launch();
  const existing = input.id ? db.items.find((i) => i.id === input.id) : null;
  if (existing) {
    const removed = existing.assetIds.filter((a) => !input.assetIds.includes(a));
    Object.assign(existing, { ...input, createdAt: existing.createdAt, updatedAt: now() });
    if (removed.length) deleteAssets(removed);
    save("launchpad");
    return existing;
  }
  const item = { ...input, id: uid(), createdAt: now(), updatedAt: now() };
  db.items.push(item);
  save("launchpad");
  return item;
}

export function deleteItem(id: string) {
  const db = launch();
  const item = db.items.find((i) => i.id === id);
  if (!item) return;
  db.items = db.items.filter((i) => i.id !== id);
  save("launchpad");
  deleteAssets(item.assetIds);
}

export function patchPlatform(id: string, p: PlatformKey, patch: Partial<QueueItem["platforms"][PlatformKey]>) {
  const item = getItem(id);
  if (!item) return null;
  Object.assign(item.platforms[p], patch);
  item.updatedAt = now();
  save("launchpad");
  return item;
}

export function duplicateItem(id: string) {
  const src = getItem(id);
  if (!src) return null;
  const copy: QueueItem = structuredClone(src);
  copy.id = "";
  copy.title = `${src.title} (copy)`;
  copy.assetIds = []; // files aren't duplicated — reattach what you need
  for (const p of PLATFORMS) Object.assign(copy.platforms[p], { status: "pending", postedAt: null, url: null, loggedPostIds: [] });
  return upsertItem(copy);
}

// ─── Hashtag sets & program tags ────────────────────────────────────────────
export const listSets = () => [...launch().sets];
export function saveSet(set: HashtagSet) {
  const db = launch();
  const ex = set.id ? db.sets.find((s) => s.id === set.id) : null;
  if (ex) Object.assign(ex, set);
  else db.sets.push({ ...set, id: uid() });
  save("launchpad");
}
export function deleteSet(id: string) {
  const db = launch();
  db.sets = db.sets.filter((s) => s.id !== id);
  save("launchpad");
}

/** Program tags, seeded once from what the programs' emails require. */
export function programTags(collabs: { id: string; name: string }[]): ProgramTags {
  const db = launch();
  if (!db.seededTags) {
    for (const c of collabs) {
      const n = c.name.toLowerCase();
      if (n.includes("dreamina")) db.programTags[c.id] ??= ["#DreaminaCPP", "@dreamina_cpp"];
      if (n.includes("pollo")) db.programTags[c.id] ??= ["#PolloAI"];
    }
    db.seededTags = true;
    save("launchpad");
  }
  return { ...db.programTags };
}
export function setProgramTags(collabId: string, tags: string[]) {
  const db = launch();
  if (tags.length) db.programTags[collabId] = tags;
  else delete db.programTags[collabId];
  save("launchpad");
}

// ─── Characters album ───────────────────────────────────────────────────────
function album(): AlbumEntry[] {
  const db = chars();
  if (!db.album) {
    // one-time migration from the old character sheets: keep every picture
    const seen = new Set<string>();
    db.album = (db.characters ?? []).flatMap((c) => (c.assetIds ?? []).map((assetId) => ({ assetId, addedAt: c.createdAt ?? now() })))
      .filter((e) => !seen.has(e.assetId) && seen.add(e.assetId));
    delete db.characters;
    save("characters");
  }
  return db.album;
}

export const listAlbum = () => [...album()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

export function addToAlbum(assetIds: string[]) {
  const list = album();
  for (const assetId of assetIds) if (!list.some((e) => e.assetId === assetId)) list.push({ assetId, addedAt: now() });
  save("characters");
}

export function removeFromAlbum(assetId: string) {
  const db = chars();
  db.album = album().filter((e) => e.assetId !== assetId);
  save("characters");
  deleteAssets([assetId]);
}
