// Central place for configuration. Server-side only (client code must not import this).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** Server-only key that bypasses row level security. Used for invites/admin and nothing else. */
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";

/** No Supabase configured → local mode: data in .tools/data on this computer, no login, single user. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_KEY;

/** Running on Vercel. The media tools (ffmpeg, yt-dlp, Whisper…) only exist on your own computer. */
export const IS_HOSTED = !!process.env.VERCEL;

/** Media in cloud mode: a private Supabase Storage bucket by default (see supabase/migrations). */
export const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media";

/** Optional: Cloudflare R2 (S3-compatible) instead of Supabase Storage. Used when these keys are set. */
export const R2 = {
  accountId: process.env.R2_ACCOUNT_ID ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.R2_BUCKET ?? "creator-hub-media",
};
export const HAS_R2 = !!(R2.accountId && R2.accessKeyId && R2.secretAccessKey);

/**
 * Per-user media allowance in cloud mode (admins are unlimited) and the biggest single file.
 * Defaults fit Supabase's Free plan (1 GB in total, 50 MB per file); on Pro or R2, raise them with
 * STORAGE_LIMIT_MB / MAX_UPLOAD_MB.
 */
export const STORAGE_LIMIT_BYTES = (Number(process.env.STORAGE_LIMIT_MB) || (HAS_R2 ? 2048 : 200)) * 1024 * 1024;
export const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || (HAS_R2 ? 500 : 50)) * 1024 * 1024;

/** Fallback timezone when the browser hasn't told us the user's own one yet. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Los_Angeles";

/** Bootstrap admins (comma-separated). The real list lives in public.invites (is_admin). */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
