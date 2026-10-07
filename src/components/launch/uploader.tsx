"use client";
// Shared drag-and-drop uploader for Launchpad posts and character sheets (streams each file to /api/assets).
import { useState } from "react";
import { IconUpload } from "@/components/icons";
import type { Asset } from "@/lib/launch/types";

export async function uploadFile(f: File, onProgress?: (pct: number) => void): Promise<Asset> {
  // XHR (not fetch) so we get upload progress for big videos
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
