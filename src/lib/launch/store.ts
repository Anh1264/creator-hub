// Launchpad queue, hashtag sets, program tags and the characters album.
// Local mode → .tools/data JSON (./local-store); cloud mode → Supabase (./cloud-store). Always async.
import "server-only";
import { IS_DEMO } from "../env";
import * as cloud from "./cloud-store";
import * as local from "./local-store";
import type { AlbumEntry, HashtagSet, PlatformKey, ProgramTags, QueueItem } from "./types";

type Plan = Partial<QueueItem["platforms"][PlatformKey]>;
const a = <T,>(v: T) => Promise.resolve(v);

export const newItem = local.newItem;

export const listItems = (): Promise<QueueItem[]> => (IS_DEMO ? a(local.listItems()) : cloud.listItems());
export const getItem = (id: string): Promise<QueueItem | null> => (IS_DEMO ? a(local.getItem(id)) : cloud.getItem(id));
export const upsertItem = (i: QueueItem): Promise<QueueItem> => (IS_DEMO ? a(local.upsertItem(i)) : cloud.upsertItem(i));
export const deleteItem = async (id: string) => { if (IS_DEMO) local.deleteItem(id); else await cloud.deleteItem(id); };
export const patchPlatform = (id: string, p: PlatformKey, patch: Plan): Promise<QueueItem | null> =>
  (IS_DEMO ? a(local.patchPlatform(id, p, patch)) : cloud.patchPlatform(id, p, patch));
export const duplicateItem = (id: string): Promise<QueueItem | null> => (IS_DEMO ? a(local.duplicateItem(id)) : cloud.duplicateItem(id));

export const listSets = (): Promise<HashtagSet[]> => (IS_DEMO ? a(local.listSets()) : cloud.listSets());
export const saveSet = async (s: HashtagSet) => { if (IS_DEMO) local.saveSet(s); else await cloud.saveSet(s); };
export const deleteSet = async (id: string) => { if (IS_DEMO) local.deleteSet(id); else await cloud.deleteSet(id); };
export const programTags = (collabs: { id: string; name: string }[]): Promise<ProgramTags> =>
  (IS_DEMO ? a(local.programTags(collabs)) : cloud.programTags(collabs));
export const setProgramTags = async (collabId: string, tags: string[]) => {
  if (IS_DEMO) local.setProgramTags(collabId, tags); else await cloud.setProgramTags(collabId, tags);
};

export const listAlbum = (): Promise<AlbumEntry[]> => (IS_DEMO ? a(local.listAlbum()) : cloud.listAlbum());
export const addToAlbum = async (ids: string[]) => { if (IS_DEMO) local.addToAlbum(ids); else await cloud.addToAlbum(ids); };
export const removeFromAlbum = async (id: string) => { if (IS_DEMO) local.removeFromAlbum(id); else await cloud.removeFromAlbum(id); };
