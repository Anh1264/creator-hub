"use client";
// Sign PDF: open a PDF, place signatures / initials / text / dates / check marks, download the signed copy.
// pdf.js renders the pages, pdf-lib writes the result. Nothing is uploaded anywhere.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  IconCalendar, IconDownload, IconInfo, IconLayers, IconPen, IconPlus, IconTrash, IconType, IconUndo, IconUpload, IconX,
} from "@/components/icons";
import { INK, MARK_PATHS, TEXT_BASELINE, TEXT_FONT, TEXT_LINE, type Ink, type PageGeom, type Placed, type SavedMark } from "@/lib/pdf/sign";
import { saveAs } from "../api";
import { marksStore, textToPng, textWidth, winAnsi, type Png } from "./ink";
import { SignaturePad } from "./pad";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;
function pdfjs() {
  // the "legacy" build includes polyfills, so older Safari / iOS versions work too
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = `/api/pdfjs/legacy/build/pdf.worker.min.mjs?v=${m.version}`;
    return m;
  });
  return pdfjsPromise;
}

type Doc = { name: string; bytes: Uint8Array; pdf: PDFDocumentProxy; geoms: PageGeom[] };
type Armed =
  | { type: "image"; src: string; ratio: number; kind: SavedMark["kind"] }
  | { type: "text"; text: string }
  | { type: "mark"; mark: "check" | "cross" | "dot" };
type MarkName = "check" | "cross" | "dot";

const MAX_PAGE_W = 860;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const today = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });

export function SignPdf() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [items, setItemsState] = useState<Placed[]>([]);
  const itemsRef = useRef<Placed[]>([]);
  const history = useRef<Placed[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const marks = useSyncExternalStore(marksStore.subscribe, marksStore.get, marksStore.server);
  const [pad, setPad] = useState<SavedMark["kind"] | null>(null);
  const [ink, setInk] = useState<Ink>("black");
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const docEl = useRef<HTMLDivElement>(null);

  // ── items + undo ──
  const setItems = useCallback((next: Placed[]) => { itemsRef.current = next; setItemsState(next); setSaved(null); }, []);
  const commit = useCallback((next: Placed[], before = itemsRef.current) => {
    history.current.push(before);
    if (history.current.length > 100) history.current.shift();
    setCanUndo(true);
    setItems(next);
  }, [setItems]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    setCanUndo(history.current.length > 0);
    setEditing(null);
    setItems(prev);
    if (selected && !prev.some((i) => i.id === selected)) setSelected(null);
  }, [selected, setItems]);
  const update = (id: string, p: Partial<Placed>) => itemsRef.current.map((i) => (i.id === id ? ({ ...i, ...p } as Placed) : i));

  // ── open / close ──
  async function open(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setError("That isn't a PDF.");
    setError(null);
    setLoading(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [lib, { openForSigning }] = await Promise.all([pdfjs(), import("@/lib/pdf/stamp")]);
      await openForSigning(bytes); // fails early for locked files, before anything is placed
      const pdf = await lib.getDocument({
        data: bytes.slice(), // pdf.js takes ownership of the buffer it's given
        cMapUrl: "/api/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/api/pdfjs/standard_fonts/",
        wasmUrl: "/api/pdfjs/wasm/",
        iccUrl: "/api/pdfjs/iccs/",
      }).promise;
      const geoms: PageGeom[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const v = (await pdf.getPage(i)).getViewport({ scale: 1 });
        geoms.push({ width: v.width, height: v.height, transform: Array.from(v.transform) });
      }
      history.current = [];
      setCanUndo(false);
      setItems([]);
      setSelected(null);
      setDoc((old) => { void old?.pdf.loadingTask.destroy(); return { name: file.name, bytes, pdf, geoms }; });
      setSaved(null);
    } catch (e) {
      const err = e as Error;
      setError(
        err.name === "PasswordException" ? "This PDF needs a password. Open it with the password, choose Print → Save as PDF to make an unlocked copy, then sign that copy."
        : err.name === "InvalidPDFException" ? "That file isn't a valid PDF, or it's damaged."
        : err.message || "Couldn't open that PDF.",
      );
    } finally {
      setLoading(null);
    }
  }
  function close() {
    if (items.length && !saved && !confirm("Close this PDF? Your signatures on it haven't been downloaded yet.")) return;
    void doc?.pdf.loadingTask.destroy();
    setDoc(null);
    setItems([]);
    history.current = [];
    setCanUndo(false);
    setSelected(null);
    setArmed(null);
  }
  useEffect(() => () => { void doc?.pdf.loadingTask.destroy(); }, [doc]);

  // warn before leaving with unsaved signatures
  useEffect(() => {
    if (!items.length || saved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [items.length, saved]);

  // fit pages to the column width
  useEffect(() => {
    const el = docEl.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setWidth(Math.min(MAX_PAGE_W, Math.floor(inner)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // ── saved signatures ──
  function addMark(png: Png, remember: boolean, kind: SavedMark["kind"]) {
    setPad(null);
    const mark: SavedMark = { id: uid(), kind, src: png.src, w: png.w, h: png.h, createdAt: Date.now() };
    if (remember) {
      if (!marksStore.set([mark, ...marks])) setError("Couldn't save it in this browser (storage is full or blocked). You can still use it now.");
    }
    if (doc) { setSelected(null); setArmed({ type: "image", src: mark.src, ratio: mark.w / mark.h, kind }); }
  }
  function forgetMark(id: string) {
    marksStore.set(marks.filter((m) => m.id !== id));
  }

  // ── placing ──
  function place(page: number, fx: number, fy: number) {
    if (!doc || !armed) return;
    const g = doc.geoms[page];
    let it: Placed;
    if (armed.type === "image") {
      // a signature ~2 in wide, initials ~0.8 in, never taller than ~0.7 in
      const [maxW, maxH] = armed.kind === "initials" ? [62, 34] : [150, 50];
      const wPt = Math.min(maxW, maxH * armed.ratio);
      const w = wPt / g.width, h = wPt / armed.ratio / g.height;
      it = { id: uid(), page, type: "image", src: armed.src, ratio: armed.ratio, w, h, x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h) };
    } else if (armed.type === "text") {
      const size = 11;
      const w = textWidth(armed.text, size) / g.width, h = (size * TEXT_LINE) / g.height;
      it = { id: uid(), page, type: "text", text: armed.text, size, ink, w, h, x: clamp(fx, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h) };
    } else {
      const s = 13;
      const w = s / g.width, h = s / g.height;
      it = { id: uid(), page, type: "mark", mark: armed.mark, ink, w, h, x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h) };
    }
    commit([...itemsRef.current, it]);
    setSelected(it.id);
    if (armed.type === "text" && armed.text === "") setEditing(it.id);
    if (armed.type !== "mark") setArmed(null); // check marks stay armed: forms usually need several
  }

  function remove(id: string) {
    commit(itemsRef.current.filter((i) => i.id !== id));
    setSelected(null);
    setEditing(null);
  }
  function toAllPages(id: string) {
    if (!doc) return;
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    const copies = doc.geoms.map((_, page) => page).filter((p) => p !== it.page && !itemsRef.current.some((o) => o.page === p && same(o, it)))
      .map((page) => ({ ...it, id: uid(), page }));
    commit([...itemsRef.current, ...copies]);
  }
  function setItemInk(id: string, k: Ink) {
    setInk(k);
    commit(update(id, { ink: k } as Partial<Placed>));
  }

  // ── drag to move / resize ──
  function drag(e: React.PointerEvent, it: Placed, mode: "move" | "resize") {
    if (editing === it.id || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(it.id);
    setArmed(null);
    const pageEl = (e.currentTarget as HTMLElement).closest(".sp-page") as HTMLElement;
    const r = pageEl.getBoundingClientRect();
    const g = doc!.geoms[it.page];
    const before = itemsRef.current;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dxp = ev.clientX - sx, dyp = ev.clientY - sy;
      if (!moved && Math.hypot(dxp, dyp) < 3) return;
      moved = true;
      if (mode === "move") {
        setItems(update(it.id, { x: clamp(it.x + dxp / r.width, 0, 1 - it.w), y: clamp(it.y + dyp / r.height, 0, 1 - it.h) }));
        return;
      }
      const wpx = it.w * r.width, hpx = it.h * r.height;
      let k = Math.max((wpx + dxp) / wpx, (hpx + dyp) / hpx);
      k = Math.min(k, (1 - it.x) / it.w, (1 - it.y) / it.h); // stay on the page
      if (it.type === "text") {
        const size = clamp(Math.round(it.size * k * 2) / 2, 5, 96);
        setItems(update(it.id, { size, w: textWidth(it.text, size) / g.width, h: (size * TEXT_LINE) / g.height }));
      } else {
        k = Math.max(k, (it.type === "mark" ? 6 : 16) / (it.w * g.width)); // minimum size in points
        setItems(update(it.id, { w: it.w * k, h: it.h * k }));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) commit(itemsRef.current, before);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, dialog, [contenteditable]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.key === "Escape") { setArmed(null); setSelected(null); return; }
      const it = itemsRef.current.find((i) => i.id === selected);
      if (!it || !doc) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(it.id); return; }
      if (e.key === "Enter" && it.type === "text") { e.preventDefault(); setEditing(it.id); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        const g = doc.geoms[it.page], step = e.shiftKey ? 10 : 1;
        commit(update(it.id, {
          x: clamp(it.x + (arrows[e.key][0] * step) / g.width, 0, 1 - it.w),
          y: clamp(it.y + (arrows[e.key][1] * step) / g.height, 0, 1 - it.h),
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── export ──
  async function download() {
    if (!doc) return;
    setExporting(true);
    setError(null);
    try {
      const { stampPdf } = await import("@/lib/pdf/stamp");
      const prepared = itemsRef.current
        .filter((i) => i.type !== "text" || i.text.trim())
        .map((i) => (i.type === "text" && !winAnsi(i.text) ? { ...i, png: textToPng(i.text, i.size, i.ink, i.w * doc.geoms[i.page].width) } : i));
      const out = await stampPdf(doc.bytes, prepared, doc.geoms);
      const name = `${doc.name.replace(/\.pdf$/i, "") || "document"}-signed.pdf`;
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      saveAs(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSaved(name);
    } catch (e) {
      setError((e as Error).message || "Couldn't create the signed PDF.");
    } finally {
      setExporting(false);
    }
  }

  const sigs = marks.filter((m) => m.kind === "signature");
  const inits = marks.filter((m) => m.kind === "initials");
  const sel = items.find((i) => i.id === selected) ?? null;
  const byPage = useMemo(() => {
    const m = new Map<number, Placed[]>();
    for (const it of items) m.set(it.page, [...(m.get(it.page) ?? []), it]);
    return m;
  }, [items]);
  const isArmed = (a: Partial<Armed> & { src?: string; mark?: string }) =>
    !!armed && armed.type === a.type && (a.type === "image" ? (armed as { src: string }).src === a.src : a.type === "mark" ? (armed as { mark: string }).mark === a.mark : true);
  const arm = (a: Armed) => { setSelected(null); setEditing(null); setArmed(isArmed(a) ? null : a); };

  const savedRow = (list: SavedMark[], kind: SavedMark["kind"]) => (
    <div className="sp-group">
      <span className="sp-glabel">{kind === "signature" ? "Signature" : "Initials"}</span>
      {list.map((m) => (
        <span key={m.id} className={`sp-saved${isArmed({ type: "image", src: m.src }) ? " on" : ""}`}>
          <button type="button" disabled={!doc} title={doc ? "Click, then click on the page" : "Open a PDF first"}
            onClick={() => arm({ type: "image", src: m.src, ratio: m.w / m.h, kind })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt={kind} draggable={false} />
          </button>
          <button type="button" className="sp-forget" title="Forget this one" aria-label="Forget" onClick={() => forgetMark(m.id)}><IconX /></button>
        </span>
      ))}
      <button type="button" className="sp-tool" onClick={() => setPad(kind)} title={`New ${kind}`}>
        {list.length ? <IconPlus /> : <><IconPen />{kind === "signature" ? "Add signature" : "Add initials"}</>}
      </button>
    </div>
  );

  // ── empty state ──
  if (!doc) {
    return (
      <>
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void open(f); }}
        >
          {loading ? <div className="spin" /> : <IconUpload />}
          <b>{loading ? `Opening ${loading}…` : "Drop a PDF here or click to choose"}</b>
          <span>Contracts, NDAs, forms, invoices. The file is opened in this browser and never uploaded.</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = ""; }} />
        </label>
        {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}

        <section className="block" style={{ marginTop: 28 }}>
          <div className="db-h"><h2 className="h2">Your signatures</h2><span className="cnt">{marks.length || ""}</span></div>
          <div className="sp-shelf">{savedRow(sigs, "signature")}{savedRow(inits, "initials")}</div>
          <p className="hint">Saved in this browser only, never on the server. Make them once, reuse them on every PDF.</p>
        </section>

        <div className="callout" style={{ marginTop: 28 }}>
          <IconInfo />
          <div>This adds a visible signature, the same kind you&apos;d get from Preview or a basic e-sign app, and that&apos;s what most contracts and forms ask for. It isn&apos;t a certificate-based digital signature (the kind that locks the file and proves who signed it).</div>
        </div>
        {pad && <SignaturePad kind={pad} onClose={() => setPad(null)} onDone={(png, remember) => addMark(png, remember, pad)} />}
      </>
    );
  }

  // ── editor ──
  return (
    <>
      <div className="sp-bar">
        <div className="sp-tools">
          {savedRow(sigs, "signature")}
          {savedRow(inits, "initials")}
          <div className="sp-group">
            <button type="button" className={`sp-tool${isArmed({ type: "text" }) && armed?.type === "text" && armed.text === "" ? " on" : ""}`} onClick={() => arm({ type: "text", text: "" })} title="Text"><IconType />Text</button>
            <button type="button" className={`sp-tool${armed?.type === "text" && armed.text !== "" ? " on" : ""}`} onClick={() => arm({ type: "text", text: today() })} title="Today's date"><IconCalendar />Date</button>
            {(["check", "cross", "dot"] as MarkName[]).map((m) => (
              <button key={m} type="button" className={`sp-tool sq${isArmed({ type: "mark", mark: m }) ? " on" : ""}`} onClick={() => arm({ type: "mark", mark: m })}
                title={m === "check" ? "Check mark" : m === "cross" ? "Cross" : "Dot"} aria-label={m}>
                <MarkSvg mark={m} color="currentColor" />
              </button>
            ))}
          </div>
          <span className="sp" />
          <button type="button" className="sp-tool sq" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo"><IconUndo /></button>
        </div>
        <div className="sp-status">
          {armed ? (
            <span className="sp-armed">
              {armed.type === "mark" ? "Click each spot on the page. Esc when you're done." : "Click on the page where it goes. Esc to cancel."}
            </span>
          ) : saved ? (
            <span className="sp-ok">Downloaded <b>{saved}</b></span>
          ) : (
            <span className="faint">{items.length ? `${items.length} item${items.length > 1 ? "s" : ""} placed · drag to move, corner to resize` : "Pick a signature or a tool, then click on the page."}</span>
          )}
          <span className="sp" />
          <span className="sp-file" title={doc.name}>{doc.name} · {doc.geoms.length} page{doc.geoms.length > 1 ? "s" : ""}</span>
          <button type="button" className="sp-link" onClick={close}>Close</button>
          <button type="button" className="btn" onClick={() => void download()} disabled={exporting || !items.length}>
            {exporting ? <div className="spin" /> : <IconDownload width={15} height={15} />}Download<span className="hide-m">signed PDF</span>
          </button>
        </div>
        {error && <p className="err">{error}</p>}
      </div>

      <div className={`sp-doc${armed ? " armed" : ""}`} ref={docEl} onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        {width > 0 && doc.geoms.map((g, i) => (
          <PdfPage key={i} pdf={doc.pdf} index={i} geom={g} width={width} armed={!!armed}
            onPlace={(fx, fy) => place(i, fx, fy)} onBackground={() => { setSelected(null); setEditing(null); }}>
            {(byPage.get(i) ?? []).map((it) => (
              <Item key={it.id} it={it} geom={g} scale={width / g.width} selected={selected === it.id} editing={editing === it.id}
                onDown={(e, mode) => drag(e, it, mode)}
                onEdit={() => { setSelected(it.id); setEditing(it.id); }}
                onText={(text, before) => {
                  const w = textWidth(text, (it as { size: number }).size) / g.width;
                  if (before) commit(update(it.id, { text, w } as Partial<Placed>), before);
                  else setItems(update(it.id, { text, w } as Partial<Placed>));
                }}
                onDoneEditing={() => {
                  setEditing(null);
                  const cur = itemsRef.current.find((x) => x.id === it.id);
                  if (cur?.type === "text" && !cur.text.trim()) { setItems(itemsRef.current.filter((x) => x.id !== it.id)); setSelected(null); }
                }}
                itemsNow={() => itemsRef.current}
              />
            ))}
            {sel && sel.page === i && !editing && (
              <ItemBar it={sel} pages={doc.geoms.length}
                onEdit={() => setEditing(sel.id)} onInk={(k) => setItemInk(sel.id, k)}
                onAll={() => toAllPages(sel.id)} onDelete={() => remove(sel.id)} />
            )}
          </PdfPage>
        ))}
      </div>
      {pad && <SignaturePad kind={pad} onClose={() => setPad(null)} onDone={(png, remember) => addMark(png, remember, pad)} />}
    </>
  );
}

const same = (a: Placed, b: Placed) => a.type === b.type && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  && (a.type !== "image" || a.src === (b as { src: string }).src);

// ─── One page: canvas rendered on demand + an overlay for the placed items ──────────
function PdfPage({ pdf, index, geom, width, armed, onPlace, onBackground, children }: {
  pdf: PDFDocumentProxy; index: number; geom: PageGeom; width: number; armed: boolean;
  onPlace: (fx: number, fy: number) => void; onBackground: () => void; children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const height = Math.round((width * geom.height) / geom.width);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (!e.isIntersecting) setReady(false);
    }, { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!visible) {
      // free the memory of pages far off screen; they re-render when you scroll back
      c.width = 0; c.height = 0;
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: (width / geom.width) * dpr });
        const off = document.createElement("canvas");
        off.width = Math.round(viewport.width);
        off.height = Math.round(viewport.height);
        task = page.render({ canvas: off, viewport });
        await task.promise;
        if (cancelled) return;
        // swap in one go so a re-render on resize doesn't flash white
        c.width = off.width; c.height = off.height;
        c.getContext("2d")!.drawImage(off, 0, 0);
        off.width = 0;
        setReady(true);
      } catch (e) {
        if ((e as Error).name !== "RenderingCancelledException") console.warn("pdf render", e);
      }
    }, 60);
    return () => { cancelled = true; clearTimeout(t); task?.cancel(); };
  }, [visible, width, pdf, index, geom.width]);

  return (
    <div className="sp-pagewrap">
      <div
        ref={wrap}
        className={`sp-page${ready ? " ready" : ""}`}
        style={{ width, height }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("sp-canvas-el")) return;
          if (!armed) { onBackground(); return; }
          e.preventDefault(); // keep focus on the new text box instead of moving it to the page
          const r = e.currentTarget.getBoundingClientRect();
          onPlace((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
      >
        <canvas ref={canvas} className="sp-canvas-el" style={{ width, height }} aria-label={`Page ${index + 1}`} />
        {children}
      </div>
      <div className="sp-pnum">{index + 1}</div>
    </div>
  );
}

// ─── A placed item ───────────────────────────────────────────────────────────
function Item({ it, geom, scale, selected, editing, onDown, onEdit, onText, onDoneEditing, itemsNow }: {
  it: Placed; geom: PageGeom; scale: number; selected: boolean; editing: boolean;
  onDown: (e: React.PointerEvent, mode: "move" | "resize") => void;
  onEdit: () => void;
  onText: (text: string, before?: Placed[]) => void;
  onDoneEditing: () => void;
  itemsNow: () => Placed[];
}) {
  const before = useRef<Placed[] | null>(null);
  const startText = useRef("");
  const style: React.CSSProperties = { left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: `${it.h * 100}%` };
  const wPt = it.w * geom.width, hPt = it.h * geom.height;

  return (
    <div
      className={`sp-item sp-${it.type}${selected ? " sel" : ""}${editing ? " editing" : ""}`}
      style={style}
      onPointerDown={(e) => onDown(e, "move")}
      onDoubleClick={() => it.type === "text" && onEdit()}
    >
      {it.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.src} alt="Signature" draggable={false} />
      )}
      {it.type === "mark" && <MarkSvg mark={it.mark} color={INK[it.ink]} />}
      {it.type === "text" && !editing && (
        <svg viewBox={`0 0 ${wPt} ${hPt}`} preserveAspectRatio="none" aria-label={it.text}>
          <text x="0" y={it.size * TEXT_BASELINE} fontSize={it.size} fontFamily={TEXT_FONT} fill={INK[it.ink]} style={{ whiteSpace: "pre" }}>{it.text}</text>
        </svg>
      )}
      {it.type === "text" && editing && (
        <input
          className="sp-input"
          autoFocus
          value={it.text}
          placeholder="Type…"
          style={{ fontSize: it.size * scale, color: INK[it.ink], fontFamily: TEXT_FONT, width: Math.max(90, wPt * scale + 28) }}
          onFocus={() => { before.current = itemsNow(); startText.current = it.text; }}
          onChange={(e) => onText(e.target.value)}
          onBlur={() => {
            // one undo step for the whole edit
            if (before.current && it.text !== startText.current) onText(it.text, before.current);
            before.current = null;
            onDoneEditing();
          }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
      {selected && !editing && <span className="sp-handle" onPointerDown={(e) => onDown(e, "resize")} aria-hidden />}
    </div>
  );
}

function ItemBar({ it, pages, onEdit, onInk, onAll, onDelete }: {
  it: Placed; pages: number; onEdit: () => void; onInk: (k: Ink) => void; onAll: () => void; onDelete: () => void;
}) {
  const below = it.y < 0.06;
  return (
    <div className={`sp-itembar${below ? " below" : ""}`} style={{ left: `${(it.x + it.w / 2) * 100}%`, top: below ? `${(it.y + it.h) * 100}%` : `${it.y * 100}%` }}
      onPointerDown={(e) => e.stopPropagation()}>
      {it.type === "text" && <button type="button" onClick={onEdit}><IconType />Edit</button>}
      {it.type !== "image" && (Object.keys(INK) as Ink[]).map((k) => (
        <button key={k} type="button" className={`sp-dot${it.ink === k ? " on" : ""}`} style={{ "--ink": INK[k] } as React.CSSProperties}
          onClick={() => onInk(k)} title={k === "black" ? "Black" : "Blue"} aria-label={k} />
      ))}
      {pages > 1 && <button type="button" onClick={onAll} title="Put a copy at this spot on every page (for initials)"><IconLayers />All pages</button>}
      <button type="button" onClick={onDelete} title="Delete (⌫)" aria-label="Delete"><IconTrash /></button>
    </div>
  );
}

function MarkSvg({ mark, color }: { mark: MarkName; color: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {mark === "dot"
        ? <path d={MARK_PATHS.dot} fill={color} />
        : <path d={MARK_PATHS[mark]} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="miter" />}
    </svg>
  );
}
