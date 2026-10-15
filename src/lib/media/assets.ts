// Media for the Launchpad, Characters and Prompts. Local mode keeps files in .tools/data/assets
// (see ../launch/assets.ts); cloud mode keeps metadata in Supabase (public.assets, row level security)
// and the bytes in Supabase Storage (or Cloudflare R2, see ./storage.ts) under <user id>/<asset id>/.
import "server-only";
import { randomUUID } from "node:crypto";
import { IS_DEMO, MAX_UPLOAD_BYTES, STORAGE_LIMIT_BYTES } from "../env";
import type { CurrentUser } from "../auth";
import * as local from "../launch/assets";
import type { Asset } from "../launch/types";
import { createClient } from "../supabase/server";
import { deleteObjects, headSize, uploadHeaders, uploadUrl, viewUrl } from "./storage";

type Row = {
  id: string; user_id: string; name: string; file: string; kind: Asset["kind"]; mime: string; size: number;
  width: number | null; height: number | null; duration: number | null; has_thumb: boolean; status: string; created_at: string;
};
const toAsset = (r: Row): Asset => ({
  id: r.id, name: r.name, kind: r.kind, mime: r.mime, size: Number(r.size), width: r.width, height: r.height,
  duration: r.duration, hasThumb: r.has_thumb, createdAt: r.created_at,
});
const keyOf = (r: Pick<Row, "user_id" | "id" | "file">) => `${r.user_id}/${r.id}/${r.file}`;
const thumbKey = (r: Pick<Row, "user_id" | "id">) => `${r.user_id}/${r.id}/thumb.jpg`;

export function kindOf(mime: string, name: string): Asset["kind"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif|avif|tiff?)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(name)) return "video";
  return "other";
}

const cleanName = (raw: string) => raw.split(/[\\/]/).pop()!.replace(/[\x00-\x1f"<>|*?:]/g, "_").slice(0, 150) || "file";
const fileFor = (name: string) => {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase();
  return ext ? `original.${ext}` : "original";
};

/** Only ids we generate (16 hex chars) ever reach a query. */
export const isAssetId = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{16}$/.test(x);

// ─── Reads ──────────────────────────────────────────────────────────────────
export async function listAssets(ids: string[]): Promise<Asset[]> {
  const clean = ids.filter(isAssetId);
  if (!clean.length) return [];
  if (IS_DEMO) return local.listAssets(clean);
  const sb = await createClient();
  const { data, error } = await sb.from("assets").select("*").in("id", clean).eq("status", "ready");
  if (error) throw new Error(error.message);
  const byId = new Map((data as Row[]).map((r) => [r.id, toAsset(r)]));
  return clean.map((id) => byId.get(id)).filter((a): a is Asset => !!a);
}

export async function assetExists(id: string) {
  return (await listAssets([id])).length > 0;
}

/**
 * Where the browser should fetch a file: cloud mode → a short-lived signed storage URL; local mode → null (the
 * route streams it from disk).
 */
export async function assetRedirect(id: string, opts: { thumb?: boolean; download?: boolean }): Promise<string | "missing" | null> {
  if (IS_DEMO) return null;
  if (!isAssetId(id)) return "missing";
  const sb = await createClient();
  const { data } = await sb.from("assets").select("*").eq("id", id).eq("status", "ready").maybeSingle();
  const r = data as Row | null;
  if (!r) return "missing";
  if (opts.thumb && r.has_thumb) return viewUrl(thumbKey(r), { contentType: "image/jpeg" });
  return viewUrl(keyOf(r), { downloadName: opts.download ? r.name : undefined, contentType: r.mime || undefined });
}

// ─── Uploads (cloud): signed URL → browser PUTs to storage → complete ───────
export interface UploadTicket { id: string; url: string; thumbUrl: string; headers: Record<string, string> }

export async function startUpload(user: CurrentUser, input: { name: unknown; type: unknown; size: unknown }): Promise<UploadTicket> {
  const name = cleanName(String(input.name ?? "file"));
  const mime = String(input.type ?? "").slice(0, 100);
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) throw new Error("That file is empty.");
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error(`${name} is ${Math.round(size / 1024 / 1024)} MB; the limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB per file. Compress it first (Tools → Compress video / images).`);
  }
  const sb = await createClient();
  if (!user.isAdmin) {
    const { data } = await sb.from("assets").select("size");
    const used = (data ?? []).reduce((n, r: { size: number }) => n + Number(r.size), 0);
    if (used + size > STORAGE_LIMIT_BYTES) {
      throw new Error(`Storage is full (${Math.round(STORAGE_LIMIT_BYTES / 1024 / 1024)} MB). Delete some media first.`);
    }
  }
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const file = fileFor(name);
  const { error } = await sb.from("assets").insert({ id, name, file, kind: kindOf(mime, name), mime, size, status: "pending" });
  if (error) throw new Error(error.message);
  const row = { id, user_id: user.id, file };
  const [url, thumbUrl] = await Promise.all([uploadUrl(keyOf(row)), uploadUrl(thumbKey(row))]);
  return { id, url, thumbUrl, headers: uploadHeaders() };
}

export async function finishUpload(id: string, meta: { width?: unknown; height?: unknown; duration?: unknown; hasThumb?: unknown }): Promise<Asset> {
  if (!isAssetId(id)) throw new Error("Unknown upload.");
  const sb = await createClient();
  const { data } = await sb.from("assets").select("*").eq("id", id).maybeSingle();
  const r = data as Row | null;
  if (!r) throw new Error("Unknown upload.");
  const size = await headSize(keyOf(r));
  if (size == null) throw new Error("The file didn't arrive in storage. Try again.");
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < max ? v : null);
  const hasThumb = meta.hasThumb === true && (await headSize(thumbKey(r))) != null;
  const patch = {
    size, status: "ready", has_thumb: hasThumb,
    width: num(meta.width, 100_000) && Math.round(num(meta.width, 100_000)!),
    height: num(meta.height, 100_000) && Math.round(num(meta.height, 100_000)!),
    duration: num(meta.duration, 1e7) && Math.round(num(meta.duration, 1e7)! * 10) / 10,
  };
  const { data: updated, error } = await sb.from("assets").update(patch).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return toAsset(updated as Row);
}

// ─── Deletes ────────────────────────────────────────────────────────────────
export async function deleteAssets(ids: string[]) {
  const clean = ids.filter(isAssetId);
  if (!clean.length) return;
  if (IS_DEMO) return local.deleteAssets(clean);
  const sb = await createClient();
  const { data } = await sb.from("assets").select("id, user_id, file").in("id", clean);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return;
  await sb.from("assets").delete().in("id", rows.map((r) => r.id));
  await deleteObjects(rows.flatMap((r) => [keyOf(r), thumbKey(r)]));
}

/** Removes media that nothing points to (an upload whose post/prompt was never saved), after a day. */
export async function sweepOrphans(inUse: Set<string>) {
  if (IS_DEMO) return local.sweepOrphans(inUse);
  const sb = await createClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data } = await sb.from("assets").select("id").lt("created_at", cutoff);
  const orphans = ((data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !inUse.has(id));
  if (orphans.length) await deleteAssets(orphans);
}
