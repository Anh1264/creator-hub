// Where media bytes live in cloud mode: Supabase Storage by default, Cloudflare R2 when its keys are set
// (more free space, no per-file cap). Both hand the browser signed URLs; see the two modules.
import "server-only";
import { HAS_R2 } from "../env";
import * as r2 from "./r2";
import * as supabase from "./supabase-storage";

const backend = HAS_R2 ? r2 : supabase;
export const { uploadUrl, uploadHeaders, viewUrl, headSize, deleteObjects } = backend;
