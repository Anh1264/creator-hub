"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconDownload, IconFilm, IconUpload, IconX } from "@/components/icons";
import {
  SHORT_SIDES, TARGET_PRESETS_MB, VIDEO_LEVELS, fmtBytes, fmtDuration, pctSaved,
  type CompressJob, type VideoCodecs, type VideoCompressOptions, type VideoLevel,
} from "@/lib/tools/shared";
import { api, saveAs } from "./api";

const ACTIVE = new Set(["queued", "compressing"]);
type Upload = { key: string; name: string; size: number; pct: number; error?: string };
let seq = 0;

const DEFAULTS: VideoCompressOptions = {
  mode: "quality", level: "balanced", targetMB: 25, shortSide: null, fps: null, codec: "h264", audio: "128", speed: "balanced",
};

export function CompressVideo() {
  const [o, setO] = useState<VideoCompressOptions>(DEFAULTS);
  const set = (p: Partial<VideoCompressOptions>) => setO((x) => ({ ...x, ...p }));
  const [jobs, setJobs] = useState<CompressJob[]>([]);
  const [codecs, setCodecs] = useState<VideoCodecs | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useRef(new Set<string>()); // started from this tab → auto-save when ready

  const refresh = useCallback(() => {
    api<{ jobs: CompressJob[]; codecs: VideoCodecs }>("/api/tools/compress/video").then((r) => {
      setJobs(r.jobs);
      setCodecs(r.codecs);
      for (const j of r.jobs) {
        if (j.status === "done" && mine.current.has(j.id)) {
          mine.current.delete(j.id);
          if (!j.bigger) saveAs(`/api/tools/compress/video/${j.id}/file`);
        }
      }
    }, (e) => setError((e as Error).message));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const busy = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  /** XHR instead of fetch so big files show upload progress. */
  function upload(file: File) {
    const key = `u${++seq}`;
    setUploads((u) => [...u, { key, name: file.name, size: file.size, pct: 0 }]);
    const patch = (p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
    const q = new URLSearchParams({
      mode: o.mode, level: o.level, targetMB: String(o.targetMB), shortSide: String(o.shortSide ?? ""), fps: String(o.fps ?? ""),
      codec: o.codec, audio: o.audio, speed: o.speed,
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/tools/compress/video?${q}`);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) patch({ pct: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onload = () => {
      let data: (CompressJob & { error?: string }) | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 201 && data) {
        mine.current.add(data.id);
        setUploads((u) => u.filter((x) => x.key !== key));
        setJobs((js) => [data as CompressJob, ...js]);
        refresh();
      } else {
        patch({ error: data?.error ?? (xhr.status === 401 ? "Signed out. Reload and sign in." : `Upload failed (${xhr.status}).`) });
      }
    };
    xhr.onerror = () => patch({ error: "Upload failed. Is the hub still running?" });
    xhr.send(file);
  }

  function add(files: FileList | File[]) {
    const vids = [...files].filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|mkv|webm|avi|mts|m2ts|3gp|wmv|flv)$/i.test(f.name));
    if (!vids.length) { setError("Those aren't videos."); return; }
    setError(null);
    vids.forEach(upload);
  }

  async function remove(j: CompressJob) {
    mine.current.delete(j.id);
    setJobs((js) => js.filter((x) => x.id !== j.id));
    try { await api(`/api/tools/compress/video/${j.id}`, { method: "DELETE" }); } catch { /* already gone */ }
  }

  const level = VIDEO_LEVELS[o.level];

  return (
    <>
      <label
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <IconUpload />
        <b>Drop videos here or click to choose</b>
        <span>MP4, MOV, MKV, WebM… Pick the settings below first: they apply to the videos you add next.</span>
        <input type="file" accept="video/*,.mkv,.mts,.m2ts" multiple onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </label>

      <div className="opts">
        <div className="field"><span>How much</span>
          <div className="seg">
            {(Object.keys(VIDEO_LEVELS) as VideoLevel[]).map((k) => (
              <label key={k}><input type="radio" name="lvl" checked={o.mode === "quality" && o.level === k} onChange={() => set({ mode: "quality", level: k })} />
                <span className="tag t-gray">{VIDEO_LEVELS[k].label}</span></label>
            ))}
            <label><input type="radio" name="lvl" checked={o.mode === "size"} onChange={() => set({ mode: "size" })} />
              <span className="tag t-gray">Target size</span></label>
          </div>
        </div>
        {o.mode === "size" && (
          <div className="field"><span>Max file size</span>
            <div className="size-row">
              <input className="input num-in" type="number" min={1} step={1} value={o.targetMB}
                onChange={(e) => set({ targetMB: Math.max(1, Number(e.target.value) || 1) })} aria-label="Target size in MB" />
              <span className="faint" style={{ fontSize: 13 }}>MB</span>
              {TARGET_PRESETS_MB.map((mb) => (
                <button key={mb} type="button" className={`tag ${o.targetMB === mb ? "t-blue" : "t-gray"} chip-btn`} onClick={() => set({ targetMB: mb })}>{mb}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="hint">
        {o.mode === "size"
          ? "Two passes, so it takes about twice as long. Lands just under the size; drops the resolution if needed to keep it sharp."
          : level.note}
      </p>

      <div className="opts">
        <label className="field"><span>Resolution</span>
          <select className="select" value={o.shortSide ?? ""} onChange={(e) => set({ shortSide: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Keep original</option>
            {SHORT_SIDES.map((s) => <option key={s} value={s}>{s}p (max)</option>)}
          </select>
        </label>
        <label className="field"><span>Frame rate</span>
          <select className="select" value={o.fps ?? ""} onChange={(e) => set({ fps: e.target.value ? (Number(e.target.value) as 30 | 24) : null })}>
            <option value="">Keep original</option>
            <option value="30">30 fps (max)</option>
            <option value="24">24 fps (max)</option>
          </select>
        </label>
        <label className="field"><span>Codec</span>
          <select className="select" value={o.codec} onChange={(e) => set({ codec: e.target.value as "h264" | "hevc" })}>
            <option value="h264">H.264 · plays everywhere</option>
            <option value="hevc" disabled={codecs ? !codecs.hevc : false}>H.265 · ~40% smaller, newer devices{codecs && !codecs.hevc ? " (not available)" : ""}</option>
          </select>
        </label>
        <label className="field"><span>Audio</span>
          <select className="select" value={o.audio} onChange={(e) => set({ audio: e.target.value as VideoCompressOptions["audio"] })}>
            <option value="128">Keep · AAC 128 kbps</option>
            <option value="64">Smaller · 64 kbps</option>
            <option value="none">Remove</option>
          </select>
        </label>
        <label className="field"><span>Speed</span>
          <select className="select" value={o.speed} onChange={(e) => set({ speed: e.target.value as VideoCompressOptions["speed"] })}>
            <option value="fast">Fast · slightly bigger</option>
            <option value="balanced">Balanced</option>
            <option value="thorough">Thorough · slower, smaller</option>
          </select>
        </label>
      </div>
      {codecs && !codecs.h264 && <p className="err" style={{ marginTop: 10 }}>This computer&apos;s ffmpeg has no H.264 encoder. Run <code className="k">npm install</code> again.</p>}
      {codecs?.h264?.endsWith("videotoolbox") && <p className="hint">Using Apple&apos;s hardware encoder (no x264 in this ffmpeg). Fast, but sizes are less exact.</p>}
      {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}

      <section className="block" style={{ marginTop: 32 }}>
        <div className="db-h"><h2 className="h2">Videos</h2><span className="cnt">{jobs.length + uploads.length || ""}</span></div>
        {jobs.length + uploads.length === 0 ? <div className="empty-card"><p>Compressed videos show up here and save to your Downloads folder when ready.</p></div> : (
          <div className="jobs">
            {uploads.map((u) => (
              <div className="job" key={u.key}>
                <div className="jt"><IconUpload /></div>
                <div className="jb">
                  <div className="jn" title={u.name}>{u.name}</div>
                  {!u.error && <div className="bar"><i style={{ width: `${u.pct}%` }} /></div>}
                  <div className="jm">
                    {u.error ? <span className="err">{u.error}</span> : <><span className="tag dot t-blue">{u.pct < 100 ? "Uploading" : "Reading video"}</span><span>{u.pct}% of {fmtBytes(u.size)}</span></>}
                  </div>
                </div>
                {u.error && <div className="ja"><button className="icon-btn" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} title="Clear" aria-label="Clear"><IconX /></button></div>}
              </div>
            ))}
            {jobs.map((j) => <JobRow key={j.id} job={j} onRemove={() => remove(j)} />)}
          </div>
        )}
      </section>
    </>
  );
}

const fmtEta = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function JobRow({ job: j, onRemove }: { job: CompressJob; onRemove: () => void }) {
  const active = ACTIVE.has(j.status);
  const tone = j.status === "done" ? (j.bigger ? "yellow" : "green") : j.status === "error" ? "red" : active ? "blue" : "gray";
  const label = j.status === "done" ? (j.bigger ? "Bigger than original" : "Ready") : j.status === "error" ? "Failed" : j.status === "queued" ? "Queued" : j.stage;
  const saved = j.outputSize != null ? pctSaved(j.inputSize, j.outputSize) : null;
  const resized = j.outWidth && j.width && (j.outWidth !== j.width || j.outHeight !== j.height);
  return (
    <div className="job">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {j.hasThumb ? <img className="jt" src={`/api/tools/compress/video/${j.id}/thumb`} alt="" /> : <div className="jt"><IconFilm /></div>}
      <div className="jb">
        <div className="jn" title={j.name}>{j.name}</div>
        {active && <div className={`bar${j.status === "queued" ? " indet" : ""}`}><i style={{ width: `${j.percent}%` }} /></div>}
        <div className="jm">
          <span className={`tag dot t-${tone}`}>{label}</span>
          <span>{j.label}</span>
          {j.status === "compressing" && <span>{j.percent.toFixed(0)}%</span>}
          {j.status === "compressing" && j.eta != null && <span>{fmtEta(j.eta)} left</span>}
          {j.status === "done" && j.outputSize != null ? (
            <span className="size-change">{fmtBytes(j.inputSize)} → <b>{fmtBytes(j.outputSize)}</b>{saved != null && <em className={saved > 0 ? "good" : "bad"}>{saved > 0 ? `−${saved}%` : `+${-saved}%`}</em>}</span>
          ) : <span>{fmtBytes(j.inputSize)}</span>}
          <span>{fmtDuration(j.duration)}</span>
          {resized ? <span>{j.width}×{j.height} → {j.outWidth}×{j.outHeight}</span> : j.width ? <span>{j.width}×{j.height}</span> : null}
          {j.status === "done" && j.tookMs && <span>took {fmtEta(Math.round(j.tookMs / 1000))}</span>}
        </div>
        {j.bigger && j.status === "done" && <div className="jm"><span>This video was already efficiently compressed. Keep the original, or try Strong / a target size.</span></div>}
        {j.note && <div className="jm"><span>{j.note}</span></div>}
        {j.error && <div className="jm"><span className="err">{j.error}</span></div>}
      </div>
      <div className="ja">
        {j.status === "done" && (
          <a className="btn ghost" href={`/api/tools/compress/video/${j.id}/file`} download><IconDownload width={14} height={14} />Save</a>
        )}
        <button className="icon-btn" onClick={onRemove} title={active ? "Cancel" : "Clear"} aria-label={active ? "Cancel" : "Clear"}><IconX /></button>
      </div>
    </div>
  );
}
