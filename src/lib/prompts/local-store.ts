// Local-mode backend for the prompt library (.tools/data/prompts.json). The app uses ./store.ts.
import "server-only";
import { randomUUID } from "node:crypto";
import { load, save } from "../local/db";
import { deleteAssets } from "../launch/assets";
import type { PromptEntry } from "./types";

type PromptDb = { prompts: PromptEntry[] };
const db = () => load<PromptDb>("prompts", () => ({ prompts: [] }));
const now = () => new Date().toISOString();

export const listPrompts = () => [...db().prompts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const getPrompt = (id: string) => db().prompts.find((p) => p.id === id) ?? null;
export const promptAssetIds = () => db().prompts.flatMap((p) => p.assetIds);

export function upsertPrompt(input: PromptEntry): PromptEntry {
  const d = db();
  const existing = input.id ? d.prompts.find((p) => p.id === input.id) : null;
  if (existing) {
    const removed = existing.assetIds.filter((a) => !input.assetIds.includes(a));
    Object.assign(existing, { ...input, createdAt: existing.createdAt, updatedAt: now() });
    save("prompts");
    if (removed.length) deleteAssets(removed);
    return existing;
  }
  const entry = { ...input, id: randomUUID().replace(/-/g, "").slice(0, 12), createdAt: now(), updatedAt: now() };
  d.prompts.push(entry);
  save("prompts");
  return entry;
}

export function deletePrompt(id: string) {
  const d = db();
  const p = d.prompts.find((x) => x.id === id);
  if (!p) return;
  d.prompts = d.prompts.filter((x) => x.id !== id);
  save("prompts");
  deleteAssets(p.assetIds);
}

export function setFavorite(id: string, favorite: boolean) {
  const p = getPrompt(id);
  if (!p) return;
  p.favorite = favorite; // not a content edit: leave updatedAt alone so the list order doesn't jump
  save("prompts");
}
