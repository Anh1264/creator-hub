"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconDownload, IconFilm, IconUpload, IconX } from "@/components/icons";
import {
  LANGUAGES, fmtDuration, fmtStamp, toParagraphs, toSrt, toVtt,
  type Browser, type MediaInfo, type ModelStatus, type Segment, type TranscriptJob, type TranscriptMethod, type WhisperModel, BROWSERS,
} from "@/lib/tools/shared";
import { api, saveAs } from "./api";

const ACTIVE = new Set(["queued", "fetching", "transcribing"]);
const langName = (code: string | null) => (code ? LANGUAGES.find(([c]) => c === code.split("-")[0])?.[1] ?? code : "");

export function Transcribe() {
  const [source, setSource] = useState<"link" | "file">("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<TranscriptMethod>("auto");
  const [language, setLanguage] = useState("auto");
  const [model, setModel] = useState<WhisperModel>("turbo");
  const [cookies, setCookies] = useState<Browser | "">("");
  const [jobs, setJobs] = useState<TranscriptJob[]>([]);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<TranscriptJob | null>(null);
  const [over, setOver] = useState(false);
  const lastLooked = useRef("");
  const viewer = useRef<HTMLElement>(null);

  const loadJobs = useCallback(() => { api<TranscriptJob[]>("/api/tools/transcribe/jobs").then(setJobs, () => {}); }, []);
  const loadModels = useCallback(() => { api<ModelStatus[]>("/api/tools/transcribe/models").then(setModels, () => {}); }, []);
  useEffect(() => { loadJobs(); loadModels(); }, [loadJobs, loadModels]);

  const busy = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(loadJobs, 1000);
    return () => clearInterval(t);
  }, [busy, loadJobs]);

  const downloading = models.some((m) => m.downloading);
  useEffect(() => {
    if (!downloading) return;
    const t = setInterval(loadModels, 1000);
    return () => clearInterval(t);
  }, [downloading, loadModels]);

  // Keep the open transcript fresh while it's still being made (live text from Whisper).
  const openSummary = jobs.find((j) => j.id === openId);
  const openActive = !!openSummary && ACTIVE.has(openSummary.status);
  const openStatus = openSummary?.status;
  useEffect(() => {
    if (!openId) return;
    const get = () => api<TranscriptJob>(`/api/tools/transcribe/jobs/${openId}`).then(setOpen, () => setOpen(null));
    get();
    if (!openActive) return;
    const t = setInterval(get, 1200);
    return () => clearInterval(t);
  }, [openId, openActive, openStatus]);

  async function look(target = url) {
    const link = target.trim();
    if (!link) return;
    lastLooked.current = link;
    setLooking(true); setError(null); setInfo(null);
    try {
      const found = await api<MediaInfo>("/api/tools/media/info", { method: "POST", json: { url: link, cookies: cookies || null } });
      if (lastLooked.current === link) setInfo(found);
    } catch (e) {
      if (lastLooked.current === link) setError((e as Error).message);
    } finally {
      if (lastLooked.current === link) setLooking(false);
    }
  }

  const needsModel = source === "file" || method === "whisper";
  const selected = models.find((m) => m.key === model);
  const modelReady = selected?.installed ?? false;

  async function go(overrides?: Partial<{ url: string; method: TranscriptMethod; title: string; thumbnail: string | null }>) {
    setStarting(true); setError(null);
    try {
      let job: TranscriptJob;
      if (source === "file" && !overrides) {
        if (!file) return;
        const q = new URLSearchParams({ language, model, method: "whisper" });
        job = await api<TranscriptJob>(`/api/tools/transcribe/upload?${q}`, {
          method: "POST", body: file, headers: { "X-File-Name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
        });
        setFile(null);
      } else {
        const link = overrides?.url ?? (info?.url ?? url).trim();
        if (!link) return;
        job = await api<TranscriptJob>("/api/tools/transcribe/jobs", {
          method: "POST",
          json: {
            url: link, method: overrides?.method ?? method, language, model, cookies: cookies || null,
            title: overrides?.title ?? info?.title ?? null, thumbnail: overrides?.thumbnail ?? info?.thumbnail ?? null,
          },
        });
        if (!overrides) { setUrl(""); setInfo(null); }
      }
      setJobs((js) => [job, ...js]);
      setOpenId(job.id);
      setTimeout(() => viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function remove(id: string) {
    setJobs((js) => js.filter((j) => j.id !== id));
    if (openId === id) { setOpenId(null); setOpen(null); }
    try { await api(`/api/tools/transcribe/jobs/${id}`, { method: "DELETE" }); } catch { /* gone */ }
  }

  async function getModel(key: WhisperModel) {
    try { setModels(await api<ModelStatus[]>("/api/tools/transcribe/models", { method: "POST", json: { model: key } })); }
    catch (e) { setError((e as Error).message); }
  }

  const capLine = info && (() => {
    const parts = [
      ...info.captions.manual.map((l) => `${langName(l)} (uploaded)`),
      ...info.captions.auto.filter((l) => !info.captions.manual.includes(l)).map((l) => `${langName(l)} (auto)`),
    ];
    return parts.length ? `Captions: ${parts.join(" · ")}` : "No captions — Whisper will transcribe the audio";
  })();

  const canGo = source === "file" ? !!file : !!(info?.url ?? url).trim();

  return (
    <>
      <div className="seg" style={{ marginBottom: 14 }}>
        {(["link", "file"] as const).map((s) => (
          <label key={s}><input type="radio" name="src" checked={source === s} onChange={() => { setSource(s); setError(null); }} />
            <span className="tag t-gray">{s === "link" ? "Video link" : "Upload a file"}</span></label>
        ))}
      </div>

      {source === "link" ? (
        <form className="urlbar" onSubmit={(e) => { e.preventDefault(); if (info && info.url === url.trim()) void go(); else void look(); }}>
          <input
            className="input" type="url" inputMode="url" placeholder="Paste a YouTube link (or TikTok, X, Vimeo…)" value={url} autoFocus aria-label="Link"
            onChange={(e) => { setUrl(e.target.value); if (info && e.target.value.trim() !== info.url) setInfo(null); }}
            onPaste={(e) => { const t = e.clipboardData.getData("text").trim(); if (/^https?:\/\//.test(t)) { e.preventDefault(); setUrl(t); void look(t); } }}
          />
          <button className="btn ghost" type="button" onClick={() => look()} disabled={!url.trim() || looking}>{looking ? "Looking up…" : "Look up"}</button>
        </form>
      ) : (
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        >
          <IconUpload />
          <b>{file ? file.name : "Drop an audio or video file, or click to choose"}</b>
          <span>{file ? `${(file.size / 1048576).toFixed(1)} MB · transcribed with Whisper on this computer` : "MP4, MOV, MP3, M4A, WAV… your own recordings and edits"}</span>
          <input type="file" accept="audio/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
        </label>
      )}

      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}

      {source === "link" && info && (
        <div className="preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {info.thumbnail ? <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" /> : <div className="ph" />}
          <div className="pt">
            <b>{info.title}</b>
            <span>{[info.uploader, fmtDuration(info.duration), info.site].filter(Boolean).join(" · ")}</span>
            <span>{capLine}</span>
          </div>
        </div>
      )}

      <div className="opts">
        {source === "link" && (
          <label className="field"><span>Method</span>
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value as TranscriptMethod)}>
              <option value="auto">Captions if available, else Whisper</option>
              <option value="captions">Captions only (instant)</option>
              <option value="whisper">Whisper (most accurate, punctuated)</option>
            </select>
          </label>
        )}
        <label className="field"><span>Language</span>
          <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        {(needsModel || method === "auto") && (
          <label className="field"><span>Whisper model</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value as WhisperModel)}>
              {models.map((m) => <option key={m.key} value={m.key}>{m.label}{m.installed ? "" : " (not downloaded)"}</option>)}
            </select>
          </label>
        )}
        {(needsModel || method === "auto") && selected && !selected.installed && (
          <div className="field"><span>&nbsp;</span>
            {selected.downloading
              ? <span className="tag dot t-blue" style={{ padding: "8px 10px" }}>Downloading {selected.progress.toFixed(0)}%</span>
              : <button className="btn" type="button" onClick={() => getModel(selected.key)}><IconDownload width={14} height={14} />Download model ({selected.size})</button>}
          </div>
        )}
        {source === "link" && (
          <label className="field"><span>Sign-in cookies</span>
            <select className="select" value={cookies} onChange={(e) => setCookies(e.target.value as Browser | "")}>
              <option value="">None</option>
              {BROWSERS.map((b) => <option key={b} value={b}>From {b[0].toUpperCase() + b.slice(1)}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="go-row">
        <button className="btn" onClick={() => go()} disabled={!canGo || starting || looking || (needsModel && !modelReady)}>
          {starting ? "Starting…" : "Get transcript"}
        </button>
        {needsModel && !modelReady && <span className="hint" style={{ marginTop: 0 }}>{selected?.error ? <span className="err">Download failed: {selected.error}</span> : "Whisper needs its model first — one-time download, then it works offline."}</span>}
      </div>

      {open && (
        <section className="block" ref={viewer} style={{ marginTop: 36 }}>
          <Viewer job={open} onClose={() => { setOpenId(null); setOpen(null); }}
            onWhisper={open.method === "captions" && open.url ? () => go({ url: open.url!, method: "whisper", title: open.title, thumbnail: open.thumbnail }) : undefined}
            whisperReady={modelReady} />
        </section>
      )}

      <section className="block" style={{ marginTop: 36 }}>
        <div className="db-h"><h2 className="h2">Transcripts</h2><span className="cnt">{jobs.length || ""}</span></div>
        {jobs.length === 0 ? <div className="empty-card"><p>Transcripts are saved here (on this computer) until you delete them.</p></div> : (
          <div className="jobs">
            {jobs.map((j) => <Row key={j.id} job={j} active={j.id === openId} onOpen={() => { setOpenId(j.id); setTimeout(() => viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} onRemove={() => remove(j.id)} />)}
          </div>
        )}
      </section>

      <section className="block">
        <div className="db-h"><h2 className="h2">Whisper models</h2></div>
        <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>Needed for videos without captions and for uploaded files. Downloaded once into this project, then it all runs offline.</p>
        <div className="status-list">
          {models.map((m) => (
            <div className="status-row" key={m.key}>
              <span className="sn" style={{ width: 130 }}>{m.label}</span>
              {m.installed ? <span className="tag dot t-green">Ready</span>
                : m.downloading ? <span className="tag dot t-blue">{m.progress.toFixed(0)}%</span>
                : <button className="btn ghost" onClick={() => getModel(m.key)}><IconDownload width={14} height={14} />Download {m.size}</button>}
              <span className="sv">{m.error ? <span className="err">{m.error}</span> : m.note}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Row({ job: j, active, onOpen, onRemove }: { job: TranscriptJob; active: boolean; onOpen: () => void; onRemove: () => void }) {
  const running = ACTIVE.has(j.status);
  const tone = j.status === "done" ? "green" : j.status === "error" ? "red" : running ? "blue" : "gray";
  return (
    <div className="job" style={active ? { borderColor: "var(--fg)" } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {j.thumbnail ? <img className="jt" src={j.thumbnail} alt="" referrerPolicy="no-referrer" /> : <div className="jt"><IconFilm /></div>}
      <div className="jb">
        <button className="jn ttl" onClick={onOpen} title={j.title}>{j.title}</button>
        {running && <div className={`bar${j.percent === 0 ? " indet" : ""}`}><i style={{ width: `${j.percent}%` }} /></div>}
        <div className="jm">
          <span className={`tag dot t-${tone}`}>{j.status === "done" ? "Ready" : j.status === "error" ? "Failed" : j.stage}</span>
          {running && j.percent > 0 && <span>{j.percent}%</span>}
          {j.status === "done" && <span>{methodLabel(j)}</span>}
          {j.words > 0 && <span>{j.words.toLocaleString()} word{j.words === 1 ? "" : "s"}</span>}
          {j.error && <span className="err">{j.error}</span>}
        </div>
      </div>
      <div className="ja">
        {j.status === "done" && <button className="btn ghost" onClick={onOpen}>Open</button>}
        <button className="icon-btn" onClick={onRemove} title={running ? "Cancel" : "Delete"} aria-label={running ? "Cancel" : "Delete"}><IconX /></button>
      </div>
    </div>
  );
}

function methodLabel(j: TranscriptJob) {
  if (j.method === "captions") return `${j.captionKind === "manual" ? "Uploaded captions" : "YouTube auto-captions"}${j.language ? ` · ${langName(j.language)}` : ""}`;
  if (j.method === "whisper") {
    const langs = j.languages?.length ? j.languages.map(langName).join(" + ") : langName(j.language);
    return `Whisper ${j.model === "small" ? "Small" : "Turbo"}${langs ? ` · ${langs}` : ""}`;
  }
  return "";
}

function timeLink(url: string | null, ms: number) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/youtube\.com|youtu\.be/.test(u.hostname)) return null;
    u.searchParams.set("t", `${Math.floor(ms / 1000)}s`);
    return u.toString();
  } catch { return null; }
}

function Viewer({ job, onClose, onWhisper, whisperReady }: { job: TranscriptJob; onClose: () => void; onWhisper?: () => void; whisperReady: boolean }) {
  const [stamps, setStamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const segs: Segment[] = job.segments ?? [];
  const paras = toParagraphs(segs);
  const plain = (withStamps: boolean) => paras.map((p) => (withStamps ? `[${fmtStamp(p.start)}] ` : "") + p.text).join("\n\n");
  const base = job.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "transcript";
  const save = (text: string, ext: string, type = "text/plain") => {
    const href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    saveAs(href, `${base}.${ext}`);
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };
  const running = ACTIVE.has(job.status);

  return (
    <>
      <div className="db-h tx-h">
        <h2 className="h2" title={job.title}>{job.title}</h2>
        <span className="sp" />
        <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close"><IconX /></button>
      </div>
      <div className="tx-meta">
        <span className={`tag dot t-${job.status === "done" ? "green" : job.status === "error" ? "red" : "blue"}`}>{job.status === "done" ? "Ready" : job.status === "error" ? "Failed" : `${job.stage}${job.percent ? ` · ${job.percent}%` : ""}`}</span>
        {methodLabel(job) && <span>{methodLabel(job)}</span>}
        {job.words > 0 && <span>{job.words.toLocaleString()} word{job.words === 1 ? "" : "s"}</span>}
        {job.duration ? <span>{fmtDuration(job.duration)} video</span> : null}
        {job.tookMs ? <span>took {(job.tookMs / 1000).toFixed(1)}s</span> : null}
        {job.url && <a className="proof" href={job.url} target="_blank" rel="noreferrer">Open video ↗</a>}
      </div>

      {segs.length > 0 && (
        <div className="tx-tools">
          <label className="seg"><input type="checkbox" checked={stamps} onChange={(e) => setStamps(e.target.checked)} /><span className="tag t-gray">Timestamps</span></label>
          <span className="sp" />
          <button className="btn ghost" onClick={async () => { await navigator.clipboard.writeText(plain(stamps)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
          <button className="btn ghost" onClick={() => save(plain(stamps), "txt")}>TXT</button>
          <button className="btn ghost" onClick={() => save(toSrt(segs), "srt")}>SRT</button>
          <button className="btn ghost" onClick={() => save(toVtt(segs), "vtt", "text/vtt")}>VTT</button>
          {onWhisper && !running && (
            <button className="btn ghost" onClick={onWhisper} disabled={!whisperReady} title={whisperReady ? "Auto-captions have no punctuation; Whisper does" : "Download a Whisper model first"}>Redo with Whisper</button>
          )}
        </div>
      )}

      {job.error && <p className="err">{job.error}</p>}
      {segs.length === 0 && running && <p className="muted">{job.status === "transcribing" ? "Listening… text appears here as it's recognised." : "Working…"}</p>}
      <div className="tx-body">
        {paras.map((p, i) => {
          const href = timeLink(job.url, p.start);
          return (
            <p key={i}>
              {stamps && (href ? <a className="tx-t" href={href} target="_blank" rel="noreferrer">{fmtStamp(p.start)}</a> : <span className="tx-t">{fmtStamp(p.start)}</span>)}
              {p.text}
            </p>
          );
        })}
        {running && segs.length > 0 && <p className="faint">…</p>}
      </div>
    </>
  );
}
