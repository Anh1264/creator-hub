#!/usr/bin/env node
// Copies everything from local mode (.tools/data on this computer) into your cloud account:
// collabs, posts, Launchpad, hashtag sets, program tags, the Characters album, prompts, and all media
// (→ Supabase Storage, or Cloudflare R2 when the R2_* keys are set).
//
// Usage (from the project folder, after you've signed in on the live site once):
//   node --env-file=.env.local scripts/import-local.mjs you@example.com
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (plus the R2_* keys if you use R2).
// Files bigger than MAX_UPLOAD_MB (default 50, Supabase Free's per-file cap) are skipped and listed at the end.
// Safe to re-run: it stops if the account already has collabs (pass --force to import anyway).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

const email = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase();
const force = process.argv.includes("--force");
const DATA = path.join(process.cwd(), ".tools", "data");
const need = (k) => process.env[k] || die(`Missing ${k} in .env.local`);
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (!email) die("Usage: node --env-file=.env.local scripts/import-local.mjs you@example.com");

const sb = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || die("Missing SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const USE_R2 = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
const r2 = USE_R2 ? new AwsClient({ accessKeyId: need("R2_ACCESS_KEY_ID"), secretAccessKey: need("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" }) : null;
const bucketUrl = USE_R2 ? `${process.env.R2_ENDPOINT || `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`}/${process.env.R2_BUCKET || "creator-hub-media"}` : "";
const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media";
const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB) || (USE_R2 ? 500 : 50)) * 1024 * 1024;

const read = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), "utf8")); } catch { return fallback; }
};
const ok = (res, what) => { if (res.error) die(`${what}: ${res.error.message}`); return res.data; };

// ─── Who ─────────────────────────────────────────────────────────────────────
const profile = ok(await sb.from("profiles").select("id, email").eq("email", email).maybeSingle(), "find profile");
if (!profile) die(`No account for ${email} yet. Sign in on the live site once, then run this again.`);
const uid = profile.id;
const existing = ok(await sb.from("collabs").select("id", { count: "exact", head: false }).eq("user_id", uid), "check collabs");
if (existing.length && !force) die(`${email} already has ${existing.length} collabs in the cloud. Re-run with --force to import anyway (you'll get duplicates).`);

const hub = read("hub", { collabs: [], posts: [] });
const launch = read("launchpad", { items: [], sets: [], programTags: {} });
const chars = read("characters", { album: [] });
const prompts = read("prompts", { prompts: [] });
const assets = read("assets", {});
console.log(`Importing into ${email}: ${hub.collabs.length} collabs, ${hub.posts.length} posts, ${launch.items.length} Launchpad posts, ${prompts.prompts.length} prompts, ${Object.keys(assets).length} media files…`);

// ─── Collabs & posts ─────────────────────────────────────────────────────────
const collabId = new Map();
for (const c of hub.collabs) {
  const row = ok(await sb.from("collabs").insert({
    user_id: uid, name: c.name, color: c.color, platforms: c.platforms ?? [], monthly_quota: c.monthlyQuota,
    start_month: c.startMonth, end_month: c.endMonth, notes: c.notes ?? "", archived: !!c.archived, created_at: c.createdAt,
  }).select("id").single(), `collab ${c.name}`);
  collabId.set(c.id, row.id);
}
const postId = new Map();
for (const p of hub.posts) {
  if (!collabId.has(p.collabId)) continue;
  const row = ok(await sb.from("posts").insert({
    user_id: uid, collab_id: collabId.get(p.collabId), title: p.title || "Untitled", platform: p.platform ?? "", stage: p.stage,
    due_date: p.dueDate, posted_at: p.postedAt, url: p.url, notes: p.notes ?? "", created_at: p.createdAt,
  }).select("id").single(), `post ${p.title}`);
  postId.set(p.id, row.id);
}
const mapCollabs = (ids = []) => ids.map((id) => collabId.get(id)).filter(Boolean);
console.log(`  ✓ ${collabId.size} collabs, ${postId.size} posts`);

// ─── Media → Supabase Storage (or R2) ────────────────────────────────────────
const put = async (key, file, type) => {
  if (!USE_R2) {
    const { error } = await sb.storage.from(MEDIA_BUCKET).upload(key, fs.readFileSync(file), { contentType: type, upsert: true });
    if (error) die(`upload ${key}: ${error.message}${/not found/i.test(error.message) ? ` (did you run supabase/migrations/20261015000000_media_bucket.sql?)` : ""}`);
    return;
  }
  const res = await r2.fetch(`${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT", body: fs.readFileSync(file), headers: { "Content-Type": type },
  });
  if (!res.ok) die(`upload ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
};
let media = 0;
const tooBig = [];
for (const a of Object.values(assets)) {
  const dir = path.join(DATA, "assets", a.id);
  const original = path.join(dir, a.file);
  if (!fs.existsSync(original)) { console.warn(`  ! skipped ${a.name} (file missing)`); continue; }
  if (fs.statSync(original).size > MAX_BYTES) { tooBig.push(`${a.name} (${Math.round(fs.statSync(original).size / 1024 / 1024)} MB)`); continue; }
  const file = /^original(\.[a-z0-9]{1,8})?$/.test(a.file) ? a.file : "original";
  await put(`${uid}/${a.id}/${file}`, original, a.mime || "application/octet-stream");
  const thumb = path.join(dir, "thumb.jpg");
  const hasThumb = a.hasThumb && fs.existsSync(thumb);
  if (hasThumb) await put(`${uid}/${a.id}/thumb.jpg`, thumb, "image/jpeg");
  ok(await sb.from("assets").upsert({
    id: a.id, user_id: uid, name: (a.name || "file").slice(0, 200), file, kind: a.kind, mime: a.mime ?? "", size: fs.statSync(original).size,
    width: a.width, height: a.height, duration: a.duration, has_thumb: hasThumb, status: "ready", created_at: a.createdAt,
  }), `asset ${a.name}`);
  media++;
  process.stdout.write(`\r  ↑ media ${media}/${Object.keys(assets).length}`);
}
if (media) process.stdout.write("\n");
if (tooBig.length) console.warn(`  ! ${tooBig.length} file(s) over ${MAX_BYTES / 1024 / 1024} MB were skipped (compress them, then add them again in the app):\n    ${tooBig.join("\n    ")}`);
const uploaded = new Set((await sb.from("assets").select("id").eq("user_id", uid)).data?.map((r) => r.id) ?? []);
const haveAsset = new Set(Object.keys(assets).filter((id) => uploaded.has(id)));
const mapAssets = (ids = []) => ids.filter((id) => haveAsset.has(id));

// ─── Launchpad, sets, program tags, album, prompts ───────────────────────────
for (const i of launch.items) {
  const platforms = structuredClone(i.platforms);
  for (const p of Object.values(platforms)) p.loggedPostIds = (p.loggedPostIds ?? []).map((id) => postId.get(id)).filter(Boolean);
  ok(await sb.from("launch_items").insert({
    id: randomUUID(), user_id: uid, title: i.title ?? "", notes: i.notes ?? "", caption: i.caption ?? "", hashtags: i.hashtags ?? [],
    first_comment: i.firstComment ?? "", link: i.link ?? "", asset_ids: mapAssets(i.assetIds), collab_ids: mapCollabs(i.collabIds),
    character_ids: [], platforms, ready: !!i.ready, created_at: i.createdAt, updated_at: i.updatedAt,
  }), `launch item ${i.title}`);
}
for (const s of launch.sets ?? []) ok(await sb.from("hashtag_sets").insert({ user_id: uid, name: s.name, tags: s.tags }), `set ${s.name}`);
for (const [cid, tags] of Object.entries(launch.programTags ?? {})) {
  if (collabId.has(cid)) ok(await sb.from("program_tags").upsert({ user_id: uid, collab_id: collabId.get(cid), tags }), "program tags");
}
await sb.from("profiles").update({ program_tags_seeded: true }).eq("id", uid);
for (const e of chars.album ?? []) {
  if (haveAsset.has(e.assetId)) ok(await sb.from("album").upsert({ user_id: uid, asset_id: e.assetId, added_at: e.addedAt }), "album");
}
for (const p of prompts.prompts ?? []) {
  ok(await sb.from("prompts").insert({
    user_id: uid, title: p.title, kind: p.kind, model: p.model, prompt: p.prompt, negative: p.negative ?? "", links: p.links ?? [],
    asset_ids: mapAssets(p.assetIds), tags: p.tags ?? [], collab_ids: mapCollabs(p.collabIds), notes: p.notes ?? "",
    favorite: !!p.favorite, created_at: p.createdAt, updated_at: p.updatedAt,
  }), `prompt ${p.title}`);
}
console.log(`  ✓ ${launch.items.length} Launchpad posts, ${(launch.sets ?? []).length} hashtag sets, ${(chars.album ?? []).length} album pictures, ${(prompts.prompts ?? []).length} prompts`);
console.log("Done. Your local files are untouched.");
