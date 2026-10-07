"use client";
import { useEffect, useState } from "react";
import { IconRefresh } from "@/components/icons";
import type { BinStatus, ToolsStatus } from "@/lib/tools/bin";
import { api } from "./api";

const SOURCE: Record<string, string> = { project: "this project (.tools)", system: "system", env: "env var" };

export function StatusPanel() {
  const [s, setS] = useState<ToolsStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = (fresh = false) => api<ToolsStatus>(`/api/tools/status${fresh ? "?fresh" : ""}`).then(setS, (e) => setErr(e.message));
  useEffect(() => { void load(); }, []);

  async function update() {
    setUpdating(true); setMsg(null); setErr(null);
    try {
      const r = await api<{ message: string }>("/api/tools/status/update", { method: "POST" });
      setMsg(r.message);
      await load(true);
    } catch (e) { setErr((e as Error).message); } finally { setUpdating(false); }
  }

  if (err && !s) return <p className="err">{err}</p>;
  if (!s) return <p className="muted">Checking…</p>;
  if (s.hosted) {
    return <div className="callout info"><div>The downloaders run on your own computer. Open the hub locally (<code className="k">npm run dev</code>) to use them.</div></div>;
  }

  const row = (name: string, b: BinStatus, need: string) => (
    <div className="status-row" key={name}>
      <span className="sn">{name}</span>
      <span className={`tag dot ${b.ok ? "t-green" : "t-red"}`}>{b.ok ? b.version : "Missing"}</span>
      <span className="sv" title={b.path ?? undefined}>{b.ok ? `from ${SOURCE[b.source ?? ""] ?? b.source}` : need}</span>
    </div>
  );

  return (
    <>
      <div className="status-list">
        {row("yt-dlp", s.ytdlp, "Run npm run tools:setup in the project folder")}
        {row("ffmpeg", s.ffmpeg, "Run npm install (it comes with the project)")}
        {row("ffprobe", s.ffprobe, "Run npm install (it comes with the project)")}
      </div>
      <div className="go-row">
        <button className="btn ghost" onClick={update} disabled={updating || s.ytdlp.source !== "project"}>
          <IconRefresh width={14} height={14} />{updating ? "Updating…" : "Update yt-dlp"}
        </button>
        <button className="linkish" onClick={() => load(true)}>Re-check</button>
        {msg && <span className="hint" style={{ marginTop: 0 }}>{msg}</span>}
        {err && <span className="err">{err}</span>}
      </div>
      <p className="hint">YouTube changes often. If downloads start failing, hit Update first.</p>
    </>
  );
}
