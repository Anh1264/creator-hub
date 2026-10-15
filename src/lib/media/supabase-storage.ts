// Supabase Storage (the default for media in cloud mode): a private bucket, reached with the service-role
// key on the server only. The browser gets short-lived signed URLs to upload to and view from, so big
// videos never pass through a Vercel function (which caps request bodies at 4.5 MB).
// Access control happens before a URL is handed out: public.assets (row level security) decides
// which ids a user can see; the bucket itself has no public access and no policies.
import "server-only";
import { MEDIA_BUCKET, SUPABASE_KEY } from "../env";
import { createAdminClient } from "../supabase/admin";

const bucket = () => createAdminClient().storage.from(MEDIA_BUCKET);

/** A URL the browser can PUT the file to (valid ~2 hours). */
export async function uploadUrl(key: string) {
  const { data, error } = await bucket().createSignedUploadUrl(key, { upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
  return data.signedUrl;
}

/** Extra headers the browser sends with the PUT (the public API key, which the Supabase gateway expects). */
export const uploadHeaders = (): Record<string, string> => ({ apikey: SUPABASE_KEY });

/** A short-lived URL to view (or, with `downloadName`, save) an object. */
export async function viewUrl(key: string, opts: { downloadName?: string; contentType?: string } = {}) {
  // supabase-js runs encodeURI over the finished URL, which double-encodes non-ASCII names, so the
  // download name is folded to plain ASCII first ("Vũ Quốc.mp4" → "Vu Quoc.mp4").
  const ascii = opts.downloadName?.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/["\\%#?&]/g, "").trim();
  const { data, error } = await bucket().createSignedUrl(key, 3600, { download: opts.downloadName ? ascii || "download" : false });
  if (error) throw new Error(`Storage: ${error.message}`);
  return data.signedUrl;
}

/** Size of an object, or null if it isn't there. */
export async function headSize(key: string): Promise<number | null> {
  const { data, error } = await bucket().info(key);
  if (error) {
    const status = Number((error as { status?: number; statusCode?: string | number }).status ?? (error as { statusCode?: string }).statusCode);
    if (status === 400 || status === 404 || /not.?found/i.test(error.message)) return null;
    throw new Error(`Storage: ${error.message}`);
  }
  return Number(data.size ?? 0);
}

export async function deleteObjects(keys: string[]) {
  if (!keys.length) return;
  const { error } = await bucket().remove(keys);
  if (error) console.warn(`[storage] delete failed: ${error.message}`);
}
