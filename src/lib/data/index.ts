import "server-only";
import { IS_DEMO } from "../env";
import { demoRepo } from "./demo";
import { supabaseRepo } from "./supabase";
import type { Repo } from "./types";

export const repo: Repo = IS_DEMO ? demoRepo : supabaseRepo;
export type { Repo };
