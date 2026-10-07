"use client";
// Full-page editor for one Launchpad post: media, captions, tags, per-platform plan, live checks.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteItem, duplicateItem, saveItem } from "@/app/launch-actions";
import { Mono } from "@/components/bits";
import { IconX } from "@/components/icons";
import type { Collab } from "@/lib/domain";
import {
  PLATFORMS, PLATFORM_META, charCount, checkPlatform, compose, parseTags,
  type Asset, type HashtagSet, type PlatformKey, type PlatformPlan, type ProgramTags, type QueueItem,
} from "@/lib/launch/types";
import { Uploader } from "./uploader";

export function ItemEditor({
  initial, initialAssets, collabs, sets, programTags,
}: {
  initial: QueueItem; initialAssets: Asset[]; collabs: Collab[]; sets: HashtagSet[]; programTags: ProgramTags;
}) {
  const router = useRouter();
  const [item, setItem] = useState<QueueItem>(initial);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [tagText, setTagText] = useState(initial.hashtags.join(" "));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const isNew = !item.id;

  const set = (patch: Partial<QueueItem>) => { setItem((i) => ({ ...i, ...patch })); setSaved(false); };
  const setPlan = (p: PlatformKey, patch: Partial<PlatformPlan>) =>
    setItem((i) => ({ ...i, platforms: { ...i.platforms, [p]: { ...i.platforms[p], ...patch } } }));

  const required = useMemo(() => [...new Set(item.collabIds.flatMap((id) => programTags[id] ?? []))], [item.collabIds, programTags]);
  const withTags = (i: QueueItem) => ({ ...i, hashtags: parseTags(tagText) });

  function addTags(tags: string[]) {
    const merged = parseTags([tagText, ...tags].join(" "));
    setTagText(merged.join(" "));
    setSaved(false);
  }

  function save(ready: boolean) {
    start(async () => {
      setErr(null);
      const r = await saveItem({ ...withTags(item), assetIds: assets.map((a) => a.id), ready });
      if (!r.ok) { setErr(r.error); return; }
      setItem((i) => ({ ...i, ready, id: r.data!.id }));
      setSaved(true);
      if (isNew) router.replace(`/launchpad/${r.data!.id}`);
      else router.refresh();
    });
  }

  const current = { ...withTags(item), assetIds: assets.map((a) => a.id) };
  const missingReq = required.filter((t) => !parseTags(tagText).some((x) => x.toLowerCase() === t.toLowerCase()) && !item.caption.toLowerCase().includes(t.toLowerCase()));

  return (
    <div className="ed">
      <section className="block">
        <div className="db-h"><h2 className="h2">Media</h2><span className="cnt">{assets.length || ""}</span></div>
        {assets.length > 0 && (
          <div className="ed-media">
            {assets.map((a, i) => (
              <figure key={a.id} className="ed-asset">
                {a.kind === "video"
                  ? <video src={`/api/assets/${a.id}`} poster={a.hasThumb ? `/api/assets/${a.id}?thumb=1` : undefined} controls preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={a.hasThumb ? `/api/assets/${a.id}?thumb=1` : `/api/assets/${a.id}`} alt={a.name} />}
                <figcaption>
                  <span className="nm" title={a.name}>{i + 1}. {a.name}</span>
                  <span className="faint">{[a.width && a.height ? `${a.width}×${a.height}` : null, ratio(a), a.duration ? `${a.duration}s` : null].filter(Boolean).join(" · ")}</span>
                  <button className="icon-btn" onClick={() => setAssets((xs) => xs.filter((x) => x.id !== a.id))} title="Remove" aria-label="Remove"><IconX /></button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <Uploader onAdded={(a) => { setAssets((xs) => [...xs, a]); setSaved(false); }} />
      </section>

      <section className="block">
        <div className="db-h"><h2 className="h2">Post</h2></div>
        <div className="sheet-b" style={{ padding: 0 }}>
          <label className="field"><span>Title (just for you)</span>
            <input className="input" value={item.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Witch lab teaser #2" maxLength={200} />
          </label>
          <div className="field"><span>Counts toward</span>
            <div className="seg">
              {collabs.filter((c) => !c.archived).map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={item.collabIds.includes(c.id)}
                    onChange={(e) => set({ collabIds: e.target.checked ? [...item.collabIds, c.id] : item.collabIds.filter((x) => x !== c.id) })} />
                  <span className="tag t-gray"><Mono collab={c} size="sm" />{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field"><span>Caption</span>
            <textarea className="textarea" style={{ minHeight: 130 }} value={item.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Write it once here — tweak per platform below if needed." />
          </label>
          <div className="field"><span>Hashtags &amp; mentions</span>
            <input className="input" value={tagText} onChange={(e) => { setTagText(e.target.value); setSaved(false); }} onBlur={() => setTagText(parseTags(tagText).join(" "))} placeholder="#aianimation #shortfilm @someone" />
            <div className="tag-tools">
              {missingReq.length > 0 && <button type="button" className="tag t-red" onClick={() => addTags(missingReq)}>+ Add required: {missingReq.join(" ")}</button>}
              {sets.map((s) => <button type="button" key={s.id} className="tag t-gray" onClick={() => addTags(s.tags)} title={s.tags.join(" ")}>+ {s.name}</button>)}
              {!sets.length && <span className="hint" style={{ marginTop: 0 }}>Save reusable hashtag sets at the bottom of the Launchpad page.</span>}
            </div>
          </div>
          <div className="row2">
            <label className="field"><span>First comment (optional)</span>
              <textarea className="textarea" value={item.firstComment} onChange={(e) => set({ firstComment: e.target.value })} placeholder="Credits, tools used, link in bio…" />
            </label>
            <label className="field"><span>Link (optional)</span>
              <input className="input" value={item.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://… (added on X and Facebook)" />
            </label>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="db-h">
          <h2 className="h2">Platforms</h2>
          <span className="sp" />
          <button type="button" className="linkish" style={{ paddingBottom: 10 }} onClick={() => {
            const t = PLATFORMS.map((p) => item.platforms[p].scheduledAt).find(Boolean);
            if (t) for (const p of PLATFORMS) setPlan(p, { scheduledAt: t });
          }}>Same time everywhere</button>
        </div>
        <div className="plat-grid">
          {PLATFORMS.map((p) => <PlatformEditor key={p} p={p} item={current} required={required} setPlan={(patch) => { setPlan(p, patch); setSaved(false); }} />)}
        </div>
      </section>

      <section className="block">
        <label className="field"><span>Notes (private)</span>
          <textarea className="textarea" value={item.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Music used, where the source files are, ideas for the next one…" />
        </label>
      </section>

      <div className="ed-bar">
        {err && <span className="err">{err}</span>}
        {saved && !err && <span className="hint" style={{ marginTop: 0 }}>Saved ✓</span>}
        <span className="sp" />
        {!isNew && <button className="btn danger" disabled={pending} onClick={() => {
          if (!confirm("Delete this post and its uploaded files?")) return;
          start(async () => { await deleteItem(item.id); router.push("/launchpad"); });
        }}>Delete</button>}
        {!isNew && <button className="btn ghost" disabled={pending} onClick={() => start(async () => {
          const r = await duplicateItem(item.id);
          if (r.ok && r.data) router.push(`/launchpad/${r.data.id}`);
        })}>Duplicate</button>}
        <Link className="btn ghost" href="/launchpad">Back</Link>
        <button className="btn ghost" disabled={pending} onClick={() => save(false)}>Save draft</button>
        <button className="btn" disabled={pending} onClick={() => save(true)}>{pending ? "Saving…" : item.ready ? "Save" : "Save & schedule"}</button>
      </div>
    </div>
  );
}

function ratio(a: Asset) {
  if (!a.width || !a.height) return null;
  const r = a.width / a.height;
  const known: [number, string][] = [[9 / 16, "9:16"], [4 / 5, "4:5"], [1, "1:1"], [16 / 9, "16:9"], [3 / 4, "3:4"], [4 / 3, "4:3"]];
  const hit = known.find(([k]) => Math.abs(k - r) < 0.02);
  return hit ? hit[1] : r.toFixed(2);
}

function PlatformEditor({ p, item, required, setPlan }: { p: PlatformKey; item: QueueItem; required: string[]; setPlan: (patch: Partial<PlatformPlan>) => void }) {
  const plan = item.platforms[p];
  const meta = PLATFORM_META[p];
  const { text, comment } = compose(item, p, plan);
  const len = charCount(p, text);
  const checks = checkPlatform(item, p, required);
  return (
    <div className={`plat-card${plan.enabled ? "" : " off"}`}>
      <div className="kit-h">
        <span className="plat" style={{ ["--c" as string]: meta.color }}>{meta.short}</span>
        <b>{meta.label}</b>
        <span className="sp" />
        <label className="switch"><input type="checkbox" checked={plan.enabled} onChange={(e) => setPlan({ enabled: e.target.checked })} /><span>{plan.enabled ? "On" : "Off"}</span></label>
      </div>
      {plan.enabled && (
        <>
          <label className="field"><span>When</span>
            <input className="input" type="datetime-local" value={plan.scheduledAt ?? ""} onChange={(e) => setPlan({ scheduledAt: e.target.value || null })} />
          </label>
          <label className="switch"><input type="checkbox" checked={plan.caption !== null} onChange={(e) => setPlan({ caption: e.target.checked ? item.caption : null })} /><span>Custom caption for {meta.label}</span></label>
          {plan.caption !== null && (
            <textarea className="textarea" value={plan.caption} onChange={(e) => setPlan({ caption: e.target.value })} />
          )}
          {p === "ig" && (
            <label className="switch"><input type="checkbox" checked={plan.tagsInComment} onChange={(e) => setPlan({ tagsInComment: e.target.checked })} /><span>Hashtags in first comment</span></label>
          )}
          <div className="plat-prev">
            <div className="plat-prev-h"><span>Preview</span><span className={len > meta.maxChars ? "err" : "faint"}>{len.toLocaleString()} / {meta.maxChars.toLocaleString()}</span></div>
            <pre>{text || "—"}</pre>
            {comment && <pre className="faint">↳ {comment}</pre>}
          </div>
          {checks.length > 0 && (
            <ul className="checks">
              {checks.map((c, i) => <li key={i} className={c.level === "error" ? "err" : "muted"}>{c.level === "error" ? "✕" : "•"} {c.msg}</li>)}
            </ul>
          )}
          {checks.length === 0 && <p className="ok-line">✓ Ready to post</p>}
        </>
      )}
    </div>
  );
}
