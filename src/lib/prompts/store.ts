// Prompt library. Local mode → .tools/data/prompts.json; cloud mode → Supabase. Always async.
import "server-only";
import { IS_DEMO } from "../env";
import * as cloud from "./cloud-store";
import * as local from "./local-store";
import type { PromptEntry } from "./types";

const a = <T,>(v: T) => Promise.resolve(v);
export const listPrompts = (): Promise<PromptEntry[]> => (IS_DEMO ? a(local.listPrompts()) : cloud.listPrompts());
export const getPrompt = (id: string): Promise<PromptEntry | null> => (IS_DEMO ? a(local.getPrompt(id)) : cloud.getPrompt(id));
export const upsertPrompt = (p: PromptEntry): Promise<PromptEntry> => (IS_DEMO ? a(local.upsertPrompt(p)) : cloud.upsertPrompt(p));
export const deletePrompt = async (id: string) => { if (IS_DEMO) local.deletePrompt(id); else await cloud.deletePrompt(id); };
export const setFavorite = async (id: string, fav: boolean) => { if (IS_DEMO) local.setFavorite(id, fav); else await cloud.setFavorite(id, fav); };
