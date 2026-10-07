"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconDownload, IconUpload, IconX } from "@/components/icons";
import { saveAs } from "./api";

type Item = {
  id: string; name: string; file: File; src: string;
  status: "queued" | "working" | "done" | "error";
  out?: string; error?: string; ms?: number;
};
type Bg = "transparent" | "white" | "black" | "custom";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif";
let seq = 0;

export function RemoveBg() {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState<"best" | "fast">("best");
  const [bg, setBg] = useState<Bg>("transparent");
  const [custom, setCustom] = useState("#B5532C");
  const [over, setOver] = useState(false);
  const [peek, setPeek] = useState<string | null>(null); // item id showing its original
  const working = useRef(false);
  const qualityRef = useRef(quality);
  useEffect(() => { qualityRef.current = quality; }, [quality]);
  // The list lives in a ref (so the async queue always sees the latest) and is mirrored into state for rendering.
  const list = useRef<Item[]>([]);
  const mutate = useCallback((fn: (xs: Item[]) => Item[]) => { list.current = fn(list.current); setItems(list.current); }, []);
  const patch = useCallback((id: string, p: Partial<Item>) => mutate((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), [mutate]);

  /** Works through queued images one at a time, oldest first. */
  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      for (;;) {
        const next = [...list.current].reverse().find((i) => i.status === "queued");
        if (!next) break;
        patch(next.id, { status: "working" });
        try {
          const form = new FormData();
          form.append("file", next.file);
          form.append("quality", qualityRef.current);
          const res = await fetch("/api/tools/remove-bg", { method: "POST", body: form });
          if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error ?? (res.redirected ? "Signed out. Reload and sign in." : `Failed (${res.status})`));
          }
          const out = URL.createObjectURL(await res.blob());
          if (!list.current.some((x) => x.id === next.id)) { URL.revokeObjectURL(out); continue; }
          patch(next.id, { status: "done", out, ms: Number(res.headers.get("x-took-ms")) || undefined });
        } catch (e) {
          patch(next.id, { status: "error", error: (e as Error).message });
        }
      }
    } finally {
      working.current = false;
    }
  }, [patch]);

  const add = useCallback((files: FileList | File[]) => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    mutate((xs) => [...imgs.map((file) => ({
      id: `i${++seq}`, name: file.name || `pasted-${seq}.png`, file, src: URL.createObjectURL(file), status: "queued" as const,
    })), ...xs]);
    void pump();
  }, [mutate, pump]);

  // Paste an image straight from the clipboard (⌘V) anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const fill = bg === "white" ? "#FFFFFF" : bg === "black" ? "#000000" : bg === "custom" ? custom : null;

  async function save(i: Item) {
    if (!i.out) return;
    const base = i.name.replace(/\.[^.]+$/, "") || "image";
    if (!fill) return saveAs(i.out, `${base}-no-bg.png`);
    const img = new Image();
    img.src = i.out;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    saveAs(url, `${base}-${bg === "custom" ? custom.slice(1).toLowerCase() : bg}-bg.png`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function saveAll() {
    for (const i of items.filter((x) => x.status === "done")) {
      await save(i);
      await new Promise((r) => setTimeout(r, 350)); // browsers drop rapid-fire downloads
    }
  }

  function removeItem(id: string) {
    const it = list.current.find((x) => x.id === id);
    if (it) { URL.revokeObjectURL(it.src); if (it.out) URL.revokeObjectURL(it.out); }
    mutate((xs) => xs.filter((x) => x.id !== id));
  }

  const done = items.filter((i) => i.status === "done").length;
  const pendingCount = items.filter((i) => i.status === "queued" || i.status === "working").length;

  return (
    <>
      <label
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <IconUpload />
        <b>Drop images here, click to choose, or paste</b>
        <span>JPG, PNG, WebP… several at once is fine. Everything stays on this computer.</span>
        <input type="file" accept={ACCEPT} multiple onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </label>

      <div className="opts">
        <div className="field"><span>Quality</span>
          <div className="seg">
            {(["best", "fast"] as const).map((q) => (
              <label key={q}><input type="radio" name="q" checked={quality === q} onChange={() => setQuality(q)} />
                <span className="tag t-gray">{q === "best" ? "Best" : "Fast"}</span></label>
            ))}
          </div>
        </div>
        <div className="field"><span>Background</span>
          <div className="seg" style={{ alignItems: "center" }}>
            {(["transparent", "white", "black", "custom"] as const).map((b) => (
              <label key={b}><input type="radio" name="bg" checked={bg === b} onChange={() => setBg(b)} />
                <span className="tag t-gray">{b[0].toUpperCase() + b.slice(1)}</span></label>
            ))}
            {bg === "custom" && <input className="swatch-in" type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Background colour" />}
          </div>
        </div>
      </div>

      <section className="block" style={{ marginTop: 28 }}>
        <div className="db-h">
          <h2 className="h2">Results</h2>
          <span className="cnt">{items.length ? `${done}/${items.length}${pendingCount ? " · working…" : ""}` : ""}</span>
          <span className="sp" />
          {done > 1 && <button className="btn ghost" onClick={saveAll}><IconDownload width={14} height={14} />Save all</button>}
          {items.length > 0 && <button className="btn ghost" onClick={() => items.forEach((i) => removeItem(i.id))}>Clear</button>}
        </div>
        {items.length === 0 ? <div className="empty-card"><p>Cut-outs show up here. The first image takes a few extra seconds while the model loads.</p></div> : (
          <div className="cuts">
            {items.map((i) => {
              const showOriginal = peek === i.id || i.status !== "done";
              return (
                <div className="cut" key={i.id}>
                  <div
                    className={`stage${!showOriginal && !fill ? " checker" : ""}`}
                    style={!showOriginal && fill ? ({ "--stage-bg": fill } as React.CSSProperties) : undefined}
                    onPointerDown={() => i.status === "done" && setPeek(i.id)}
                    onPointerUp={() => setPeek(null)} onPointerLeave={() => setPeek(null)}
                    title={i.status === "done" ? "Hold to compare with the original" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={showOriginal ? i.src : i.out} alt={i.name} draggable={false} />
                    {(i.status === "queued" || i.status === "working") && (
                      <div className="over">{i.status === "working" ? <><div className="spin" />Removing background…</> : "Waiting…"}</div>
                    )}
                    {i.status === "error" && <div className="over"><span className="err" style={{ padding: 16 }}>{i.error}</span></div>}
                  </div>
                  <div className="cf">
                    <span className="nm" title={i.name}>{i.name}</span>
                    {i.ms && <span className="faint" style={{ fontSize: 12 }}>{(i.ms / 1000).toFixed(1)}s</span>}
                    {i.status === "done" && <button className="icon-btn" onClick={() => save(i)} title="Save PNG" aria-label="Save PNG"><IconDownload /></button>}
                    <button className="icon-btn" onClick={() => removeItem(i.id)} title="Remove" aria-label="Remove"><IconX /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
