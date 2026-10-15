"use client";
// Shared drag-and-drop uploader for Launchpad posts, the Characters album and Prompts.
import { useState } from "react";
import { IconUpload } from "@/components/icons";
import type { Asset } from "@/lib/launch/types";

/**
 * Uploads one file and returns its Asset. Cloud mode: the browser PUTs straight to storage with a signed URL
 * (plus a small JPEG preview it renders itself), so big videos never pass through the app server.
 * Local mode: the file is streamed to /api/assets and saved on this computer.
 */
export async function uploadFile(f: File, onProgress?: (pct: number) => void): Promise<Asset> {
  const start = await fetch("/api/assets/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: f.name, type: f.type, size: f.size }),
  });
  const t = await start.json().catch(() => ({}));
  if (!start.ok) throw new Error(t.error ?? `Upload failed (${start.status})`);
  if (t.mode === "local") return localUpload(f, onProgress);

  const headers: Record<string, string> = t.headers ?? {};
  await put(t.url, f, f.type || "application/octet-stream", headers, (p) => onProgress?.(p * 0.94));
  const preview = await makePreview(f).catch(() => null);
  if (preview?.blob) await put(t.thumbUrl, preview.blob, "image/jpeg", headers).catch(() => { preview.blob = null; });
  const done = await fetch(`/api/assets/${t.id}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ width: preview?.width, height: preview?.height, duration: preview?.duration, hasThumb: !!preview?.blob }),
  });
  const a = await done.json().catch(() => ({}));
  if (!done.ok) throw new Error(a.error ?? `Upload failed (${done.status})`);
  onProgress?.(100);
  return a as Asset;
}

function put(url: string, body: Blob, type: string, headers: Record<string, string>, onProgress?: (pct: number) => void) {
  // XHR (not fetch) so we get upload progress for big videos
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", type);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100); };
    x.onload = () => {
      if (x.status < 300) return resolve();
      if (x.status === 413 || /too large|exceeded the maximum/i.test(x.responseText)) {
        return reject(new Error("That file is bigger than storage allows per file. Compress it first (Tools → Compress video / images)."));
      }
      reject(new Error(`Storage rejected the upload (${x.status}).`));
    };
    x.onerror = () => reject(new Error("Upload to storage failed. Check your connection (or the bucket's CORS settings)."));
    x.send(body);
  });
}

function localUpload(f: File, onProgress?: (pct: number) => void): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/assets");
    x.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
    x.setRequestHeader("X-File-Type", f.type);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100); };
    x.onload = () => {
      try {
        const d = JSON.parse(x.responseText);
        if (x.status >= 400) reject(new Error(d.error ?? `Upload failed (${x.status})`));
        else resolve(d as Asset);
      } catch { reject(new Error(`Upload failed (${x.status})`)); }
    };
    x.onerror = () => reject(new Error("Upload failed — is the hub still running?"));
    x.send(f);
  });
}

/** A ≤640 px JPEG preview plus size/duration, made in the browser (no server-side ffmpeg in the cloud). */
async function makePreview(f: File): Promise<{ blob: Blob | null; width?: number; height?: number; duration?: number } | null> {
  const toJpeg = async (src: CanvasImageSource, w: number, h: number) => {
    const s = Math.min(1, 640 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
    return new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.78));
  };
  if (f.type.startsWith("image/")) {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const blob = await toJpeg(bmp, bmp.width, bmp.height);
    const out = { blob, width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  }
  if (f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    try {
      const wait = (ev: string) => new Promise<void>((res, rej) => {
        const t = setTimeout(() => rej(new Error("timeout")), 10_000);
        v.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
        v.addEventListener("error", () => { clearTimeout(t); rej(new Error("video")); }, { once: true });
      });
      await wait("loadeddata");
      const duration = Number.isFinite(v.duration) ? v.duration : undefined;
      v.currentTime = duration && duration > 2 ? Math.min(1, duration / 3) : 0;
      await wait("seeked").catch(() => undefined);
      const blob = v.videoWidth ? await toJpeg(v, v.videoWidth, v.videoHeight) : null;
      return { blob, width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return null;
}

export function Uploader({ onAdded, accept = "image/*,video/*", label }: { onAdded: (a: Asset) => void; accept?: string; label?: string }) {
  const [over, setOver] = useState(false);
  const [jobs, setJobs] = useState<{ name: string; pct: number; err?: string }[]>([]);

  async function add(files: FileList | File[]) {
    for (const f of [...files]) {
      const name = f.name;
      setJobs((j) => [...j, { name, pct: 0 }]);
      try {
        const a = await uploadFile(f, (pct) => setJobs((j) => j.map((x) => (x.name === name ? { ...x, pct } : x))));
        onAdded(a);
        setJobs((j) => j.filter((x) => x.name !== name));
      } catch (e) {
        setJobs((j) => j.map((x) => (x.name === name ? { ...x, err: (e as Error).message } : x)));
      }
    }
  }

  return (
    <>
      <label
        className={`drop small${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
      >
        <IconUpload />
        <b>{label ?? "Drop videos or images, or click to choose"}</b>
        <input type="file" accept={accept} multiple onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
      </label>
      {jobs.map((j) => (
        <div key={j.name} className="up-row">
          <span className="nm">{j.name}</span>
          {j.err ? <span className="err">{j.err}</span> : <div className="bar" style={{ flex: 1 }}><i style={{ width: `${j.pct}%` }} /></div>}
          {j.err && <button className="linkish" onClick={() => setJobs((x) => x.filter((y) => y.name !== j.name))}>Dismiss</button>}
        </div>
      ))}
    </>
  );
}
