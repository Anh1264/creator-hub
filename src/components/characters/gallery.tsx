"use client";
// Characters album: drop / paste / pick images, browse them in a masonry grid, open full size.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { addToAlbum, removeFromAlbum } from "@/app/launch-actions";
import { IconChevron, IconDownload, IconX } from "@/components/icons";
import { Uploader, uploadFile } from "@/components/launch/uploader";
import type { Asset } from "@/lib/launch/types";

export function CharacterAlbum({ initial }: { initial: Asset[] }) {
  const router = useRouter();
  const [pics, setPics] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const added = useCallback((a: Asset) => {
    setPics((xs) => [a, ...xs]);
    void addToAlbum([a.id]);
  }, []);

  // Paste images straight from the clipboard (⌘V / Ctrl+V)
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      for (const f of files) {
        try { added(await uploadFile(new File([f], f.name || `pasted-${Date.now()}.png`, { type: f.type }))); }
        catch (err) { setMsg((err as Error).message); }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [added]);

  const remove = (a: Asset) => {
    if (!confirm(`Delete ${a.name}?`)) return;
    setPics((xs) => xs.filter((x) => x.id !== a.id));
    setOpen(null);
    start(async () => { await removeFromAlbum(a.id); router.refresh(); });
  };

  return (
    <>
      <Uploader accept="image/*" label="Drop character images here, click to choose, or paste" onAdded={added} />
      {msg && <p className="err">{msg}</p>}
      <div className="db-h" style={{ marginTop: 26 }}><h2 className="h2">Album</h2><span className="cnt">{pics.length || ""}</span></div>
      {pics.length === 0 ? <div className="empty-card"><p>No images yet.</p></div> : (
        <div className="album">
          {pics.map((a, i) => (
            <button key={a.id} className="album-item" onClick={() => setOpen(i)} title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.hasThumb ? `/api/assets/${a.id}?thumb=1` : `/api/assets/${a.id}`} alt={a.name} loading="lazy"
                style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined} />
            </button>
          ))}
        </div>
      )}
      {open !== null && pics[open] && (
        <Lightbox pics={pics} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onDelete={remove} busy={pending} />
      )}
    </>
  );
}

function Lightbox({ pics, index, onIndex, onClose, onDelete, busy }: {
  pics: Asset[]; index: number; onIndex: (i: number) => void; onClose: () => void; onDelete: (a: Asset) => void; busy: boolean;
}) {
  const a = pics[index];
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(pics.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, pics.length, onIndex, onClose]);

  /** Copies the image itself, so it can be pasted straight into an AI tool as a reference. */
  async function copyImage() {
    try {
      const blob = await (await fetch(`/api/assets/${a.id}`)).blob();
      const png = blob.type === "image/png" ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied(a.id);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      alert("Your browser blocked copying images — use Download instead.");
    }
  }

  return (
    <div className="lb" onClick={onClose} role="dialog" aria-modal="true" aria-label={a.name}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-name" title={a.name}>{a.name}</span>
        <span className="lb-meta">{index + 1} / {pics.length}{a.width && a.height ? ` · ${a.width}×${a.height}` : ""}</span>
        <span className="sp" />
        <button className="btn ghost" onClick={copyImage}>{copied === a.id ? "Copied ✓" : "Copy image"}</button>
        <a className="btn ghost" href={`/api/assets/${a.id}?download=1`} download><IconDownload width={14} height={14} />Download</a>
        <button className="btn danger" onClick={() => onDelete(a)} disabled={busy}>Delete</button>
        <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)"><IconX /></button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lb-img" src={`/api/assets/${a.id}`} alt={a.name} onClick={(e) => e.stopPropagation()} />
      {index > 0 && <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} aria-label="Previous"><IconChevron /></button>}
      {index < pics.length - 1 && <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} aria-label="Next"><IconChevron /></button>}
    </div>
  );
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("convert failed"))), "image/png"));
}
