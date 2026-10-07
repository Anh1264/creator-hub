"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconDownload, IconFilm, IconMusic, IconX } from "@/components/icons";
import {
  AUDIO_QUALITIES, BROWSERS, VIDEO_HEIGHTS, fmtBytes, fmtDuration,
  type AudioQuality, type Browser, type MediaInfo, type MediaJob, type VideoMode,
} from "@/lib/tools/shared";
import { api, saveAs } from "./api";

type Kind = "audio" | "video";

const COPY: Record<Kind, { placeholder: string; go: string; empty: string }> = {
  audio: { placeholder: "Paste a YouTube link…", go: "Convert to MP3", empty: "Converted songs show up here." },
  video: { placeholder: "Paste a video link — YouTube, TikTok, Instagram, X, Vimeo…", go: "Download video", empty: "Downloads show up here." },
};

const ACTIVE = new Set(["queued", "downloading", "processing"]);

export function MediaTool({ kind }: { kind: Kind }) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<AudioQuality>("320");
  const [height, setHeight] = useState<string>("1080");
  const [mode, setMode] = useState<VideoMode>("compatible");
  const [cookies, setCookies] = useState<Browser | "">("");
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const mine = useRef(new Set<string>()); // jobs started from this tab → auto-download when ready
  const lastLooked = useRef("");

  const apply = useCallback((all: MediaJob[]) => {
    setJobs(all.filter((j) => j.kind === kind));
    for (const j of all) {
      if (j.status === "done" && mine.current.has(j.id)) {
        mine.current.delete(j.id);
        saveAs(`/api/tools/media/jobs/${j.id}/file`);
      }
    }
  }, [kind]);

  const refresh = useCallback(() => {
    api<MediaJob[]>("/api/tools/media/jobs").then(apply, () => { /* keep the last list */ });
  }, [apply]);

  useEffect(() => { refresh(); }, [refresh]);
  const busy = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  async function look(target = url) {
    const link = target.trim();
    if (!link) return;
    lastLooked.current = link;
    setLooking(true); setError(null); setInfo(null);
    try {
      const found = await api<MediaInfo>("/api/tools/media/info", { method: "POST", json: { url: link, cookies: cookies || null } });
      if (lastLooked.current !== link) return;
      setInfo(found);
      if (kind === "video" && found.heights.length) {
        const best = found.heights[0];
        if (Number(height) > best) setHeight(String(VIDEO_HEIGHTS.find((h) => h <= best) ?? best));
      }
    } catch (e) {
      if (lastLooked.current === link) setError((e as Error).message);
    } finally {
      if (lastLooked.current === link) setLooking(false);
    }
  }

  async function go() {
    const link = (info?.url ?? url).trim();
    if (!link) return;
    setStarting(true); setError(null);
    try {
      const job = await api<MediaJob>("/api/tools/media/jobs", {
        method: "POST",
        json: {
          url: link, kind, audioQuality: quality, maxHeight: height === "best" ? null : Number(height), videoMode: mode,
          cookies: cookies || null, title: info?.title ?? null, thumbnail: info?.thumbnail ?? null,
        },
      });
      mine.current.add(job.id);
      setJobs((js) => [job, ...js]);
      setUrl(""); setInfo(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function remove(j: MediaJob) {
    mine.current.delete(j.id);
    setJobs((js) => js.filter((x) => x.id !== j.id));
    try { await api(`/api/tools/media/jobs/${j.id}`, { method: "DELETE" }); } catch { /* already gone */ }
  }

  const heights = info?.heights.length ? VIDEO_HEIGHTS.filter((h) => h <= info.heights[0]) : VIDEO_HEIGHTS;

  return (
    <>
      <form className="urlbar" onSubmit={(e) => { e.preventDefault(); if (info && info.url === url.trim()) void go(); else void look(); }}>
        <input
          className="input" type="url" inputMode="url" placeholder={COPY[kind].placeholder} value={url} autoFocus
          onChange={(e) => { setUrl(e.target.value); if (info && e.target.value.trim() !== info.url) setInfo(null); }}
          onPaste={(e) => { const t = e.clipboardData.getData("text").trim(); if (/^https?:\/\//.test(t)) { e.preventDefault(); setUrl(t); void look(t); } }}
          aria-label="Link"
        />
        <button className="btn ghost" type="button" onClick={() => look()} disabled={!url.trim() || looking}>
          {looking ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}

      {info && (
        <div className="preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {info.thumbnail ? <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" /> : <div className="ph" />}
          <div className="pt">
            <b>{info.title}</b>
            <span>{[info.uploader, fmtDuration(info.duration), info.site].filter(Boolean).join(" · ")}</span>
            {kind === "video" && info.heights[0] && <span>Up to {info.heights[0]}p available</span>}
            {kind === "audio" && !info.hasAudio && <span className="err">This link has no audio track.</span>}
          </div>
        </div>
      )}

      <div className="opts">
        {kind === "audio" ? (
          <label className="field"><span>MP3 quality</span>
            <select className="select" value={quality} onChange={(e) => setQuality(e.target.value as AudioQuality)}>
              {AUDIO_QUALITIES.map((q) => <option key={q} value={q}>{q} kbps{q === "320" ? " (best)" : ""}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="field"><span>Max resolution</span>
              <select className="select" value={height} onChange={(e) => setHeight(e.target.value)}>
                <option value="best">Best available</option>
                {heights.map((h) => <option key={h} value={h}>{h === 2160 ? "4K (2160p)" : `${h}p`}</option>)}
              </select>
            </label>
            <label className="field"><span>Format</span>
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>
                <option value="compatible">MP4 · H.264 (edit-friendly)</option>
                <option value="best">Max quality (VP9/AV1, may be MKV)</option>
              </select>
            </label>
          </>
        )}
        <label className="field"><span>Sign-in cookies</span>
          <select className="select" value={cookies} onChange={(e) => setCookies(e.target.value as Browser | "")} title="For private, age-restricted or members-only videos">
            <option value="">None</option>
            {BROWSERS.map((b) => <option key={b} value={b}>From {b[0].toUpperCase() + b.slice(1)}</option>)}
          </select>
        </label>
      </div>

      <div className="go-row">
        <button className="btn" onClick={go} disabled={!(info?.url ?? url).trim() || starting || looking}>
          {kind === "audio" ? <IconMusic width={15} height={15} /> : <IconDownload width={15} height={15} />}
          {starting ? "Starting…" : COPY[kind].go}
        </button>
        <span className="hint" style={{ marginTop: 0 }}>The file saves to your Downloads folder when it&apos;s ready.</span>
      </div>

      <section className="block" style={{ marginTop: 36 }}>
        <div className="db-h"><h2 className="h2">{kind === "audio" ? "Conversions" : "Downloads"}</h2><span className="cnt">{jobs.length || ""}</span></div>
        {jobs.length === 0 ? <div className="empty-card"><p>{COPY[kind].empty}</p></div> : (
          <div className="jobs">{jobs.map((j) => <JobRow key={j.id} job={j} onRemove={() => remove(j)} />)}</div>
        )}
      </section>
    </>
  );
}

function JobRow({ job: j, onRemove }: { job: MediaJob; onRemove: () => void }) {
  const active = ACTIVE.has(j.status);
  const tone = j.status === "done" ? "green" : j.status === "error" ? "red" : active ? "blue" : "gray";
  const label = j.status === "done" ? "Ready" : j.status === "error" ? "Failed" : j.status === "queued" ? "Queued" : j.stage;
  const Fallback = j.kind === "audio" ? IconMusic : IconFilm;
  return (
    <div className="job">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {j.thumbnail ? <img className="jt" src={j.thumbnail} alt="" referrerPolicy="no-referrer" /> : <div className="jt"><Fallback /></div>}
      <div className="jb">
        <div className="jn" title={j.title}>{j.title}</div>
        {active && (
          <div className={`bar${j.status === "processing" || (j.status === "downloading" && j.percent === 0) ? " indet" : ""}`}>
            <i style={{ width: `${j.percent}%` }} />
          </div>
        )}
        <div className="jm">
          <span className={`tag dot t-${tone}`}>{label}</span>
          <span>{j.label}</span>
          {j.status === "downloading" && j.percent > 0 && <span>{j.percent.toFixed(0)}%</span>}
          {j.speed && <span>{j.speed}</span>}
          {j.eta && <span>{j.eta} left</span>}
          {j.status === "done" && <span>{fmtBytes(j.size)}</span>}
          {j.error && <span className="err">{j.error}</span>}
        </div>
      </div>
      <div className="ja">
        {j.status === "done" && (
          <a className="btn ghost" href={`/api/tools/media/jobs/${j.id}/file`} download><IconDownload width={14} height={14} />Save</a>
        )}
        <button className="icon-btn" onClick={onRemove} title={active ? "Cancel" : "Clear"} aria-label={active ? "Cancel" : "Clear"}><IconX /></button>
      </div>
    </div>
  );
}
