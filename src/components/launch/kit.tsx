"use client";
// The "it's time" copy kit: everything needed to post one item on each platform by hand.
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setPosted, skipPlatform } from "@/app/launch-actions";
import { IconDownload, IconLink } from "@/components/icons";
import { PLATFORMS, PLATFORM_META, compose, fmtWhen, type Asset, type PlatformKey, type QueueItem } from "@/lib/launch/types";

export function PostKit({ item, assets, now, only }: { item: QueueItem; assets: Asset[]; now: string; only?: PlatformKey[] }) {
  const platforms = (only ?? PLATFORMS).filter((p) => item.platforms[p].enabled);
  if (!platforms.length) return <p className="muted">No platforms switched on for this post.</p>;
  return (
    <div className="kit">
      {assets.length > 0 && <MediaRow assets={assets} />}
      <div className="kit-grid">
        {platforms.map((p) => <PlatformKit key={p} item={item} p={p} now={now} />)}
      </div>
    </div>
  );
}

const noop = () => () => {};

function MediaRow({ assets }: { assets: Asset[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const canShare = useSyncExternalStore(noop, () => "canShare" in navigator, () => false);
  async function share() {
    try {
      const files = await Promise.all(assets.map(async (a) => {
        const blob = await (await fetch(`/api/assets/${a.id}`)).blob();
        return new File([blob], a.name, { type: a.mime || blob.type });
      }));
      if (!navigator.canShare?.({ files })) { setMsg("This browser can't share files — use Save instead."); return; }
      await navigator.share({ files });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Sharing failed — use Save instead.");
    }
  }
  return (
    <div className="kit-media">
      {assets.map((a, i) => (
        <a key={a.id} className="kit-asset" href={`/api/assets/${a.id}?download=1`} download title={`Save ${a.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.hasThumb ? <img src={`/api/assets/${a.id}?thumb=1`} alt="" /> : <span className="kit-noprev">{a.kind}</span>}
          <span className="kit-n">{i + 1}</span>
          {a.kind === "video" && a.duration ? <span className="kit-dur">{Math.round(a.duration)}s</span> : null}
          <span className="kit-save"><IconDownload width={13} height={13} />Save</span>
        </a>
      ))}
      {canShare && <button className="btn ghost" onClick={share}>Share to app…</button>}
      {msg && <span className="hint" style={{ marginTop: 0 }}>{msg}</span>}
    </div>
  );
}

function PlatformKit({ item, p, now }: { item: QueueItem; p: PlatformKey; now: string }) {
  const router = useRouter();
  const plan = item.platforms[p];
  const meta = PLATFORM_META[p];
  const { text, comment, tags } = compose(item, p, plan);
  const [copied, setCopied] = useState<string | null>(null);
  const [url, setUrl] = useState(plan.url ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const due = plan.status === "pending" && !!plan.scheduledAt && plan.scheduledAt <= now;

  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); } catch {
      const t = document.createElement("textarea"); t.value = value; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1400);
  }
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setErr(null);
    const r = await fn();
    if (!r.ok) setErr(r.error ?? "Something went wrong.");
    else router.refresh();
  });
  const openUrl = p === "x" ? `https://x.com/intent/post?text=${encodeURIComponent(text)}` : meta.composeUrl;
  const status = plan.status === "posted" ? <span className="tag dot t-green">Posted</span>
    : plan.status === "skipped" ? <span className="tag t-gray">Skipped</span>
    : due ? <span className="tag dot t-red">Due now</span>
    : <span className="tag dot t-blue">{plan.scheduledAt ? "Scheduled" : "No time"}</span>;

  return (
    <div className={`kit-card${plan.status !== "pending" ? " done" : ""}`}>
      <div className="kit-h">
        <span className="plat" style={{ ["--c" as string]: meta.color }}>{meta.short}</span>
        <b>{meta.label}</b>
        {status}
        <span className="sp" />
        <span className="faint" style={{ fontSize: 12 }}>{fmtWhen(plan.scheduledAt)}</span>
      </div>
      <pre className="kit-text">{text || <span className="faint">No caption</span>}</pre>
      {comment && <pre className="kit-text kit-comment"><span className="faint">First comment · </span>{comment}</pre>}
      <div className="kit-actions">
        <button className="btn" onClick={() => copy("caption", text)} disabled={!text}>{copied === "caption" ? "Copied ✓" : "Copy caption"}</button>
        {tags.length > 0 && <button className="btn ghost" onClick={() => copy("tags", tags.join(" "))}>{copied === "tags" ? "Copied ✓" : "Copy hashtags"}</button>}
        {comment && <button className="btn ghost" onClick={() => copy("comment", comment)}>{copied === "comment" ? "Copied ✓" : "Copy comment"}</button>}
        <a className="btn ghost" href={openUrl} target="_blank" rel="noreferrer">{p === "x" ? "Open X (text filled in) ↗" : `Open ${meta.label} ↗`}</a>
      </div>
      {plan.status === "posted" ? (
        <div className="kit-done">
          {plan.url ? <a className="proof" href={plan.url} target="_blank" rel="noreferrer"><IconLink />{plan.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</a> : <span className="proof missing">No live link saved</span>}
          {!plan.url && (
            <form className="kit-link" onSubmit={(e) => { e.preventDefault(); act(() => setPosted(item.id, p, true, url)); }}>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the live link" />
              <button className="btn ghost" disabled={pending || !url.trim()}>Save link</button>
            </form>
          )}
          <span className="sp" />
          <button className="linkish" onClick={() => act(() => setPosted(item.id, p, false))} disabled={pending}>Undo</button>
        </div>
      ) : plan.status === "skipped" ? (
        <div className="kit-done"><span className="muted">Not posting here.</span><span className="sp" /><button className="linkish" onClick={() => act(() => skipPlatform(item.id, p, false))}>Undo</button></div>
      ) : (
        <form className="kit-link" onSubmit={(e) => { e.preventDefault(); act(() => setPosted(item.id, p, true, url)); }}>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`Live ${meta.label} link (optional, proof for the collab)`} />
          <button className="btn" disabled={pending}>{pending ? "Saving…" : "Mark posted"}</button>
          <button type="button" className="linkish" onClick={() => act(() => skipPlatform(item.id, p, true))} disabled={pending}>Skip</button>
        </form>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
