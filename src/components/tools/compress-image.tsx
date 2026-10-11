"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconDownload, IconRefresh, IconUpload, IconX } from "@/components/icons";
import { IMAGE_MAX_SIDES, fmtBytes, pctSaved, type ImageFormat } from "@/lib/tools/shared";
import { saveAs } from "./api";

type Settings = { format: ImageFormat; mode: "quality" | "size"; quality: number; targetKB: number; maxSide: number | null; keepMeta: boolean };
type Item = {
  id: string; name: string; file: File; src: string;
  status: "queued" | "working" | "done" | "error";
  out?: string; outSize?: number; format?: string; w?: number; h?: number; q?: number | null;
  kept?: boolean; note?: string | null; error?: string; ms?: number; key?: string;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif,image/heic,image/heif,.heic,.heif";
const FORMATS: [ImageFormat, string][] = [["same", "Same as original"], ["jpeg", "JPG"], ["webp", "WebP"], ["avif", "AVIF"], ["png", "PNG"]];
const TARGETS_KB = [100, 200, 500, 1000, 2000];
const EXT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp", avif: "avif", gif: "gif" };
const keyOf = (s: Settings) => JSON.stringify(s);
let seq = 0;

function qualityHint(q: number, format: ImageFormat) {
  if (format === "png") return q >= 100 ? "Lossless: same pixels, smaller file (often only 10–30%)." : "PNG gets smaller by using fewer colours. Great for graphics, rough on photos.";
  if (q >= 100) return "Lossless. Bigger than you'd expect for photos.";
  if (q >= 85) return "Near-original. Safe for portfolio and print.";
  if (q >= 70) return "The sweet spot for web and social: hard to tell apart.";
  if (q >= 50) return "Smaller. Fine on phones, softer on big screens.";
  return "Tiny. Visible blocks and smearing.";
}

export function CompressImage() {
  const [s, setS] = useState<Settings>({ format: "same", mode: "quality", quality: 75, targetKB: 500, maxSide: null, keepMeta: false });
  const set = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const settings = useRef(s);
  useEffect(() => { settings.current = s; }, [s]);
  const working = useRef(false);
  const list = useRef<Item[]>([]);
  const mutate = useCallback((fn: (xs: Item[]) => Item[]) => { list.current = fn(list.current); setItems(list.current); }, []);
  const patch = useCallback((id: string, p: Partial<Item>) => mutate((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), [mutate]);

  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      for (;;) {
        const next = [...list.current].reverse().find((i) => i.status === "queued");
        if (!next) break;
        const cur = settings.current;
        patch(next.id, { status: "working" });
        try {
          const form = new FormData();
          form.append("file", next.file);
          form.append("format", cur.format);
          form.append("mode", cur.mode);
          form.append("quality", String(cur.quality));
          form.append("targetKB", String(cur.targetKB));
          form.append("maxSide", String(cur.maxSide ?? ""));
          form.append("keepMeta", cur.keepMeta ? "1" : "0");
          const res = await fetch("/api/tools/compress/image", { method: "POST", body: form });
          if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error ?? (res.redirected ? "Signed out. Reload and sign in." : `Failed (${res.status})`));
          }
          const blob = await res.blob();
          const out = URL.createObjectURL(blob);
          if (!list.current.some((x) => x.id === next.id)) { URL.revokeObjectURL(out); continue; }
          const [w, h] = (res.headers.get("x-image-size") ?? "").split("x").map(Number);
          const q = res.headers.get("x-quality");
          const old = list.current.find((x) => x.id === next.id)?.out;
          if (old) URL.revokeObjectURL(old);
          patch(next.id, {
            status: "done", out, outSize: blob.size, format: res.headers.get("x-format") ?? undefined, w, h,
            q: q ? Number(q) : null, kept: res.headers.get("x-kept-original") === "1",
            note: decodeURIComponent(res.headers.get("x-note") ?? "") || null,
            ms: Number(res.headers.get("x-took-ms")) || undefined, key: keyOf(cur), error: undefined,
          });
        } catch (e) {
          patch(next.id, { status: "error", error: (e as Error).message });
        }
      }
    } finally {
      working.current = false;
    }
  }, [patch]);

  const add = useCallback((files: FileList | File[]) => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|avif|tiff?)$/i.test(f.name));
    if (!imgs.length) return;
    mutate((xs) => [...imgs.map((file) => ({
      id: `c${++seq}`, name: file.name || `pasted-${seq}.png`, file, src: URL.createObjectURL(file), status: "queued" as const,
    })), ...xs]);
    void pump();
  }, [mutate, pump]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const outName = (i: Item) => (i.kept ? i.name : `${i.name.replace(/\.[^.]+$/, "") || "image"}-compressed.${EXT[i.format ?? ""] ?? "jpg"}`);
  const save = (i: Item) => i.out && saveAs(i.out, outName(i));
  async function saveAll() {
    for (const i of list.current.filter((x) => x.status === "done")) {
      save(i);
      await new Promise((r) => setTimeout(r, 350)); // browsers drop rapid-fire downloads
    }
  }
  function redoAll() {
    mutate((xs) => xs.map((x) => (x.status === "done" || x.status === "error" ? { ...x, status: "queued" } : x)));
    void pump();
  }
  function removeItem(id: string) {
    const it = list.current.find((x) => x.id === id);
    if (it) { URL.revokeObjectURL(it.src); if (it.out) URL.revokeObjectURL(it.out); }
    mutate((xs) => xs.filter((x) => x.id !== id));
  }

  const done = items.filter((i) => i.status === "done");
  const pending = items.filter((i) => i.status === "queued" || i.status === "working").length;
  const before = done.reduce((a, i) => a + i.file.size, 0);
  const after = done.reduce((a, i) => a + (i.outSize ?? 0), 0);
  const stale = done.some((i) => i.key !== keyOf(s));

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
        <span>JPG, PNG, WebP, AVIF, GIF, TIFF, HEIC. Batches are fine. Everything stays on this computer.</span>
        <input type="file" accept={ACCEPT} multiple onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </label>

      <div className="opts">
        <div className="field"><span>Format</span>
          <div className="seg">
            {FORMATS.map(([f, label]) => (
              <label key={f}><input type="radio" name="fmt" checked={s.format === f} onChange={() => set({ format: f })} />
                <span className="tag t-gray">{label}</span></label>
            ))}
          </div>
        </div>
        <div className="field"><span>How much</span>
          <div className="seg">
            <label><input type="radio" name="mode" checked={s.mode === "quality"} onChange={() => set({ mode: "quality" })} /><span className="tag t-gray">Quality</span></label>
            <label><input type="radio" name="mode" checked={s.mode === "size"} onChange={() => set({ mode: "size" })} /><span className="tag t-gray">Target size</span></label>
          </div>
        </div>
        {s.mode === "quality" ? (
          <div className="field"><span>Quality</span>
            <div className="range-row">
              <input type="range" min={10} max={100} step={1} value={s.quality} onChange={(e) => set({ quality: Number(e.target.value) })} aria-label="Quality" />
              <output>{s.quality}</output>
            </div>
          </div>
        ) : (
          <div className="field"><span>Max file size</span>
            <div className="size-row">
              <input className="input num-in" type="number" min={10} step={10} value={s.targetKB}
                onChange={(e) => set({ targetKB: Math.max(10, Number(e.target.value) || 10) })} aria-label="Target size in KB" />
              <span className="faint" style={{ fontSize: 13 }}>KB</span>
              {TARGETS_KB.map((kb) => (
                <button key={kb} type="button" className={`tag ${s.targetKB === kb ? "t-blue" : "t-gray"} chip-btn`} onClick={() => set({ targetKB: kb })}>
                  {kb >= 1000 ? `${kb / 1000} MB` : kb}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="hint">
        {s.mode === "quality"
          ? qualityHint(s.quality, s.format)
          : "Finds the highest quality that fits. If even the lowest is too big, it shrinks the image too."}
        {(s.format === "avif") && " AVIF is the smallest format but slower to make; not every app opens it yet."}
      </p>

      <div className="opts">
        <label className="field"><span>Max size (longest side)</span>
          <select className="select" value={s.maxSide ?? ""} onChange={(e) => set({ maxSide: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Keep original</option>
            {IMAGE_MAX_SIDES.map((px) => <option key={px} value={px}>{px} px</option>)}
          </select>
        </label>
        <label className="switch" style={{ paddingBottom: 8 }}>
          <input type="checkbox" checked={s.keepMeta} onChange={(e) => set({ keepMeta: e.target.checked })} />
          Keep camera &amp; location data
        </label>
      </div>

      <section className="block" style={{ marginTop: 28 }}>
        <div className="db-h">
          <h2 className="h2">Results</h2>
          <span className="cnt">{items.length ? `${done.length}/${items.length}${pending ? " · working…" : ""}` : ""}</span>
          <span className="sp" />
          {stale && !pending && <button className="btn ghost" onClick={redoAll}><IconRefresh width={14} height={14} />Redo with new settings</button>}
          {done.length > 1 && <button className="btn ghost" onClick={saveAll}><IconDownload width={14} height={14} />Save all</button>}
          {items.length > 0 && <button className="btn ghost" onClick={() => list.current.forEach((i) => removeItem(i.id))}>Clear</button>}
        </div>
        {done.length > 1 && before > 0 && (
          <p className="sum-line">{fmtBytes(before)} → {fmtBytes(after)} in total · <b>saved {fmtBytes(Math.max(0, before - after))} ({pctSaved(before, after)}%)</b></p>
        )}
        {items.length === 0 ? <div className="empty-card"><p>Compressed images show up here. Hold an image to compare it with the original.</p></div> : (
          <div className="cuts">
            {items.map((i) => {
              const showOriginal = peek === i.id || i.status !== "done";
              const saved = i.outSize != null ? pctSaved(i.file.size, i.outSize) : null;
              return (
                <div className="cut" key={i.id}>
                  <div
                    className="stage checker"
                    onPointerDown={() => i.status === "done" && setPeek(i.id)}
                    onPointerUp={() => setPeek(null)} onPointerLeave={() => setPeek(null)}
                    title={i.status === "done" ? "Hold to compare with the original" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={showOriginal ? i.src : i.out} alt={i.name} draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    {(i.status === "queued" || i.status === "working") && (
                      <div className="over">{i.status === "working" ? <><div className="spin" />Compressing…</> : "Waiting…"}</div>
                    )}
                    {i.status === "error" && <div className="over"><span className="err" style={{ padding: 16 }}>{i.error}</span></div>}
                  </div>
                  <div className="cf">
                    <span className="nm" title={i.name}>{i.name}</span>
                    {i.status === "done" && <button className="icon-btn" onClick={() => save(i)} title="Save" aria-label="Save"><IconDownload /></button>}
                    <button className="icon-btn" onClick={() => removeItem(i.id)} title="Remove" aria-label="Remove"><IconX /></button>
                  </div>
                  <div className="cm">
                    {i.status === "done" && i.outSize != null ? (
                      <span className="size-change">{fmtBytes(i.file.size)} → <b>{fmtBytes(i.outSize)}</b>
                        {!i.kept && saved != null && <em className={saved > 0 ? "good" : "bad"}>{saved > 0 ? `−${saved}%` : `+${-saved}%`}</em>}</span>
                    ) : <span>{fmtBytes(i.file.size)}</span>}
                    {i.status === "done" && <span>{(EXT[i.format ?? ""] ?? "").toUpperCase()}{i.q != null ? ` · q${i.q}` : ""}</span>}
                    {i.status === "done" && i.w ? <span>{i.w}×{i.h}</span> : null}
                    {i.note && <span className="note">{i.note}</span>}
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
