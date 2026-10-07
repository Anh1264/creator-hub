// Media files for the Launchpad and Characters, stored on this computer in .tools/data/assets/<id>/.
import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { DATA_DIR, load, save } from "../local/db";
import { findFfmpeg, findFfprobe, run } from "../tools/bin";
import type { Asset } from "./types";

export const ASSET_DIR = path.join(DATA_DIR, "assets");
const MAX_BYTES = 4 * 1024 ** 3;

type AssetDb = Record<string, Asset & { file: string }>;
const db = () => load<AssetDb>("assets", () => ({}));

export const getAsset = (id: string) => db()[id] ?? null;
export const listAssets = (ids: string[]) => ids.map((id) => db()[id]).filter(Boolean).map(publicAsset);
export const publicAsset = (a: Asset & { file?: string }): Asset => {
  const { file: _file, ...rest } = a as Asset & { file: string };
  void _file;
  return rest;
};

export const assetPath = (a: { id: string; file: string }) => path.join(ASSET_DIR, a.id, a.file);
export const thumbPath = (id: string) => path.join(ASSET_DIR, id, "thumb.jpg");

function kindOf(mime: string, name: string): Asset["kind"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|avif|tiff?)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(name)) return "video";
  return "other";
}

/** Streams an upload to disk, reads its size/duration, and makes a small preview image. */
export async function saveUpload(body: ReadableStream<Uint8Array>, rawName: string, mime: string): Promise<Asset> {
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const name = path.basename(rawName).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 150) || "file";
  const ext = path.extname(name).toLowerCase() || "";
  const file = `original${ext}`;
  const dir = path.join(ASSET_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file);
  try {
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) { bytes += chunk.length; cb(bytes > MAX_BYTES ? new Error("File is larger than 4 GB.") : null, chunk); },
    });
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), counter, fs.createWriteStream(dest));
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const kind = kindOf(mime, name);
  const asset: Asset & { file: string } = {
    id, name, kind, mime: mime || "application/octet-stream", size: fs.statSync(dest).size,
    width: null, height: null, duration: null, hasThumb: false, createdAt: new Date().toISOString(), file,
  };
  try {
    if (kind === "image") {
      const meta = await sharp(dest, { failOn: "none" }).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      asset.width = (rotated ? meta.height : meta.width) ?? null;
      asset.height = (rotated ? meta.width : meta.height) ?? null;
      await sharp(dest, { failOn: "none", animated: false }).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(thumbPath(id));
      asset.hasThumb = true;
    } else if (kind === "video") {
      await probeVideo(dest, asset);
      const ff = findFfmpeg();
      if (ff) {
        const at = asset.duration && asset.duration > 2 ? Math.min(1, asset.duration / 3) : 0;
        const r = await run(ff.path, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", dest, "-frames:v", "1", "-vf", "scale='min(640,iw)':-2", "-q:v", "4", thumbPath(id)], { timeoutMs: 60_000 });
        asset.hasThumb = r.code === 0 && fs.existsSync(thumbPath(id));
      }
    }
  } catch { /* previews are optional */ }
  db()[id] = asset;
  save("assets");
  return publicAsset(asset);
}

async function probeVideo(file: string, asset: Asset) {
  const fp = findFfprobe();
  if (!fp) return;
  const r = await run(fp.path, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file], { timeoutMs: 60_000 });
  if (r.code !== 0) return;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] ?? {};
    const rot = Math.abs(Number(s.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0)) % 180 === 90;
    asset.width = (rot ? s.height : s.width) ?? null;
    asset.height = (rot ? s.width : s.height) ?? null;
    asset.duration = j.format?.duration ? Math.round(Number(j.format.duration) * 10) / 10 : null;
  } catch { /* ignore */ }
}

export function deleteAssets(ids: string[]) {
  const d = db();
  for (const id of ids) {
    if (!d[id]) continue;
    delete d[id];
    fs.rmSync(path.join(ASSET_DIR, id), { recursive: true, force: true });
  }
  save("assets");
}

/** Removes uploads that nothing points to (e.g. a post that was never saved), after a grace period. */
export function sweepOrphans(inUse: Set<string>) {
  const d = db();
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orphans = Object.values(d).filter((a) => !inUse.has(a.id) && Date.parse(a.createdAt) < cutoff).map((a) => a.id);
  if (orphans.length) deleteAssets(orphans);
}
