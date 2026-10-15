// Cloudflare R2 (S3 API), the optional media backend (used when the R2_* keys are set; otherwise
// supabase-storage.ts). Presigned URLs, so the browser uploads and downloads straight from R2 and big
// videos never pass through a Vercel function (which caps request bodies at 4.5 MB).
import "server-only";
import { AwsClient } from "aws4fetch";
import { HAS_R2, R2 } from "../env";

let client: AwsClient | null = null;
function r2() {
  if (!HAS_R2) throw new Error("Media storage isn't set up (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  return (client ??= new AwsClient({ accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey, service: "s3", region: "auto" }));
}

const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");
const objectUrl = (key: string) => `${process.env.R2_ENDPOINT || `https://${R2.accountId}.r2.cloudflarestorage.com`}/${R2.bucket}/${enc(key)}`;

async function presign(method: "GET" | "PUT", key: string, expires: number, query: Record<string, string> = {}) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await r2().sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

/** A URL the browser can PUT the file to for the next hour. */
export const uploadUrl = (key: string) => presign("PUT", key, 3600);

/** R2's presigned URLs need no extra headers. */
export const uploadHeaders = (): Record<string, string> => ({});

/** A short-lived URL to view (or, with `downloadName`, save) an object. */
export function viewUrl(key: string, opts: { downloadName?: string; contentType?: string } = {}) {
  const q: Record<string, string> = {};
  if (opts.downloadName) q["response-content-disposition"] = contentDisposition(opts.downloadName);
  if (opts.contentType) q["response-content-type"] = opts.contentType;
  return presign("GET", key, 3600, q);
}

/** Size of an object, or null if it isn't there. */
export async function headSize(key: string): Promise<number | null> {
  const res = await r2().fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD failed (${res.status})`);
  return Number(res.headers.get("content-length") ?? 0);
}

export async function getObject(key: string): Promise<Response> {
  const res = await r2().fetch(objectUrl(key));
  if (!res.ok) throw new Error(`R2 GET failed (${res.status})`);
  return res;
}

export async function putObject(key: string, body: BodyInit, contentType: string) {
  const res = await r2().fetch(objectUrl(key), { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`R2 PUT failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function deleteObjects(keys: string[]) {
  await Promise.all(keys.map(async (k) => {
    const res = await r2().fetch(objectUrl(k), { method: "DELETE" });
    if (!res.ok && res.status !== 404) console.warn(`[r2] delete ${k} failed: ${res.status}`);
  }));
}

function contentDisposition(name: string) {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "").trim() || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
