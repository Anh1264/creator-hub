"use client";
// "New signature / initials" dialog: draw it, type it, or upload a photo of it on paper.
import { useEffect, useRef, useState } from "react";
import { IconUndo, IconUpload, IconX } from "@/components/icons";
import { INK, type Ink, type SavedMark } from "@/lib/pdf/sign";
import { HAND_FONTS } from "./fonts";
import { photoToInk, trimToPng, typedToInk, type Png } from "./ink";

type Mode = "draw" | "type" | "upload";
type Pt = { x: number; y: number; w: number };

export function SignaturePad({ kind, onClose, onDone }: {
  kind: SavedMark["kind"];
  onClose: () => void;
  onDone: (png: Png, remember: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [ink, setInk] = useState<Ink>("black");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // draw
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const [strokeCount, setStrokeCount] = useState(0);
  // type
  const [text, setText] = useState("");
  const [font, setFont] = useState(0);
  // upload
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPng, setPhotoPng] = useState<Png | null>(null);

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);

  // ── drawing: smoothed curves, thinner when the pen moves fast (or uses stylus pressure) ──
  const redraw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = INK[ink];
    ctx.strokeStyle = INK[ink];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) drawStroke(ctx, s);
  };
  useEffect(redraw); // re-paint on ink change / undo / resize

  useEffect(() => {
    const c = canvas.current;
    if (!c || mode !== "draw") return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (c.width === w && c.height === h) return;
      // keep strokes when the dialog resizes (rotate phone etc.)
      const sx = w / (c.width || w), sy = h / (c.height || h);
      strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * sx, y: p.y * sy, w: p.w * sx })));
      c.width = w; c.height = h;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const last = useRef<{ x: number; y: number; t: number; w: number } | null>(null);
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    const base = e.currentTarget.width / 160; // stroke width scales with the pad, ~3px on a 480px pad
    const w = e.pointerType === "pen" && e.pressure > 0 ? base * (0.5 + e.pressure) : base;
    strokes.current.push([{ ...p, w }]);
    last.current = { ...p, t: e.timeStamp, w };
    redraw();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current || !(e.buttons & 1)) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const c = e.currentTarget, r = c.getBoundingClientRect();
    const base = c.width / 160;
    for (const ev of events) {
      const p = { x: ((ev.clientX - r.left) / r.width) * c.width, y: ((ev.clientY - r.top) / r.height) * c.height };
      const l: { x: number; y: number; t: number; w: number } = last.current;
      const dist = Math.hypot(p.x - l.x, p.y - l.y);
      if (dist < 1) continue;
      const v = dist / Math.max(1, ev.timeStamp - l.t); // px per ms
      const target = ev.pointerType === "pen" && ev.pressure > 0 ? base * (0.5 + ev.pressure) : base * Math.max(0.45, Math.min(1.25, 1.25 - v * 0.12));
      const w: number = l.w + (target - l.w) * 0.35;
      strokes.current[strokes.current.length - 1].push({ ...p, w });
      last.current = { ...p, t: ev.timeStamp, w };
    }
    redraw();
  }
  function up() {
    if (!last.current) return;
    last.current = null;
    setStrokeCount(strokes.current.length);
  }
  function undo() { strokes.current.pop(); setStrokeCount(strokes.current.length); redraw(); }
  function clear() { strokes.current = []; setStrokeCount(0); redraw(); }

  // ── upload: re-processed when the ink colour changes ──
  const job = useRef(0);
  function processPhoto(file: File, k: Ink) {
    const n = ++job.current;
    setBusy(true);
    setError(null);
    photoToInk(file, k)
      .then((png) => { if (n !== job.current) return; setPhotoPng(png); if (!png) setError("Couldn't find any ink in that image."); })
      .catch(() => n === job.current && setError("Couldn't read that image. Try a JPG or PNG."))
      .finally(() => n === job.current && setBusy(false));
  }
  function pickInk(k: Ink) {
    setInk(k);
    if (photo) processPhoto(photo, k);
  }

  async function save() {
    setError(null);
    let png: Png | null = null;
    if (mode === "draw") png = canvas.current ? trimToPng(canvas.current) : null;
    else if (mode === "type") png = text.trim() ? await typedToInk(text.trim(), HAND_FONTS[font].family, ink) : null;
    else png = photoPng;
    if (!png) return setError(mode === "draw" ? "Draw something first." : mode === "type" ? "Type your name first." : "Choose a photo first.");
    onDone(png, remember);
  }

  const label = kind === "initials" ? "initials" : "signature";
  const ready = mode === "draw" ? strokeCount > 0 : mode === "type" ? !!text.trim() : !!photoPng;

  return (
    <dialog
      ref={ref}
      className="sheet sp-pad"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="sheet-h">
        <h3>New {label}</h3>
        <button type="button" className="x" onClick={onClose} aria-label="Close"><IconX /></button>
      </div>
      <div className="sheet-b">
        <div className="sp-tabs" role="tablist">
          {(["draw", "type", "upload"] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setError(null); }}>
              {m === "draw" ? "Draw" : m === "type" ? "Type" : "Upload photo"}
            </button>
          ))}
          <span className="sp" />
          <div className="sp-inks" aria-label="Ink colour">
            {(Object.keys(INK) as Ink[]).map((k) => (
              <button key={k} type="button" title={k === "black" ? "Black ink" : "Blue ink"} aria-pressed={ink === k}
                className={ink === k ? "on" : ""} style={{ "--ink": INK[k] } as React.CSSProperties} onClick={() => pickInk(k)} />
            ))}
          </div>
        </div>

        {mode === "draw" && (
          <div className={`sp-canvas${kind === "initials" ? " small" : ""}`}>
            <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={`Draw your ${label}`} />
            <div className="sp-line" aria-hidden><span>×</span></div>
            {strokeCount === 0 && <p className="sp-ph" aria-hidden>Sign here with your mouse, trackpad or finger</p>}
            {strokeCount > 0 && (
              <div className="sp-canvas-tools">
                <button type="button" className="btn ghost" onClick={undo}><IconUndo width={14} height={14} />Undo</button>
                <button type="button" className="btn ghost" onClick={clear}>Clear</button>
              </div>
            )}
          </div>
        )}

        {mode === "type" && (
          <>
            <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={60}
              placeholder={kind === "initials" ? "Your initials, e.g. A.V." : "Your full name"} onKeyDown={(e) => e.key === "Enter" && ready && void save()} />
            <div className="sp-fonts">
              {HAND_FONTS.map((f, i) => (
                <button key={f.name} type="button" className={font === i ? "on" : ""} onClick={() => setFont(i)} aria-pressed={font === i}>
                  <span style={{ fontFamily: f.family, color: INK[ink], fontSize: `${30 * f.scale}px` }}>{text.trim() || (kind === "initials" ? "A.V." : "Aiden Vu")}</span>
                  <small>{f.name}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {mode === "upload" && (
          <>
            <label className="drop small">
              <IconUpload />
              <b>{photo ? "Choose another photo" : "Choose a photo"}</b>
              <span>Sign on white paper, snap it. The paper is removed automatically.</span>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto(f); processPhoto(f, ink); } e.target.value = ""; }} />
            </label>
            {(photoPng || busy) && (
              <div className="sp-preview checker">
                {busy ? <div className="spin" /> : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPng!.src} alt="Signature preview" />
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="err">{error}</p>}
      </div>
      <div className="sheet-f">
        <label className="switch"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Save in this browser</label>
        <span className="sp" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={!ready || busy} onClick={() => void save()}>Use {label}</button>
      </div>
    </dialog>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Pt[]) {
  if (s.length === 1) {
    ctx.beginPath();
    ctx.arc(s[0].x, s[0].y, s[0].w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // quadratic curves through the midpoints, each segment with its own width
  for (let i = 1; i < s.length; i++) {
    const p0 = i === 1 ? s[0] : mid(s[i - 2], s[i - 1]);
    const p1 = s[i - 1];
    const p2 = mid(s[i - 1], s[i]);
    ctx.beginPath();
    ctx.lineWidth = s[i].w;
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
  }
  const a = mid(s[s.length - 2], s[s.length - 1]), b = s[s.length - 1];
  ctx.beginPath();
  ctx.lineWidth = b.w;
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 });
