"use client";
// One prompt: the text (with copy), model, where the result was posted, media, tags, collabs, notes.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deletePrompt, newVersion, savePrompt } from "@/app/prompt-actions";
import { Mono } from "@/components/bits";
import { IconCopy, IconExternal, IconStar, IconX } from "@/components/icons";
import { Uploader } from "@/components/launch/uploader";
import type { Collab } from "@/lib/domain";
import type { Asset } from "@/lib/launch/types";
import { LINK_PLATFORMS, MODEL_SUGGESTIONS, cleanUrl, parseLabels, platformOf, type PromptEntry } from "@/lib/prompts/types";
import { copyText } from "./copy";

export function PromptEditor({ initial, initialAssets, collabs, knownModels }: {
  initial: PromptEntry; initialAssets: Asset[]; collabs: Collab[]; knownModels: string[];
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [linkText, setLinkText] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [showNeg, setShowNeg] = useState(!!initial.negative);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isNew = !p.id;
  const set = (patch: Partial<PromptEntry>) => { setP((x) => ({ ...x, ...patch })); setSaved(false); };

  /** Adds one or more pasted links (one per line or space-separated). */
  function addLinks(raw = linkText) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const good: PromptEntry["links"] = [];
    const bad: string[] = [];
    for (const part of parts) {
      const url = cleanUrl(part);
      if (url) good.push({ url, platform: platformOf(url) });
      else bad.push(part);
    }
    if (good.length) set({ links: [...p.links, ...good.filter((g) => !p.links.some((l) => l.url === g.url))] });
    setLinkErr(bad.length ? `Not a link: ${bad.join(" ")}` : null);
    setLinkText(bad.join(" "));
  }

  function save() {
    setErr(null);
    const pendingLink = linkText.trim() ? cleanUrl(linkText) : null;
    const links = pendingLink && !p.links.some((l) => l.url === pendingLink) ? [...p.links, { url: pendingLink, platform: platformOf(pendingLink) }] : p.links;
    if (pendingLink) setLinkText("");
    start(async () => {
      const r = await savePrompt({ ...p, links, tags: parseLabels(tagText), assetIds: assets.map((a) => a.id) });
      if (!r.ok) { setErr(r.error); return; }
      setSaved(true);
      setP((x) => ({ ...x, links }));
      if (isNew && r.data) router.replace(`/prompts/${r.data.id}`);
      else router.refresh();
    });
  }

  // ⌘S / Ctrl+S saves
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function copy(label: string, value: string) {
    await copyText(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
  }

  function remove() {
    if (!confirm("Delete this prompt and its media?")) return;
    start(async () => { await deletePrompt(p.id); router.push("/prompts"); });
  }

  function version() {
    start(async () => {
      const r = await newVersion(p.id);
      if (r.ok && r.data) router.push(`/prompts/${r.data.id}`);
      else if (!r.ok) setErr(r.error);
    });
  }

  const models = [...new Set([...knownModels, ...MODEL_SUGGESTIONS])];

  return (
    <div className="pe">
      <input className="input big" placeholder="Untitled prompt" value={p.title} onChange={(e) => set({ title: e.target.value })} aria-label="Title" />

      <div className="opts" style={{ marginTop: 6 }}>
        <div className="field"><span>Type</span>
          <div className="seg">
            {(["video", "image"] as const).map((k) => (
              <label key={k}><input type="radio" name="kind" checked={p.kind === k} onChange={() => set({ kind: k })} />
                <span className="tag t-gray">{k === "video" ? "Video" : "Image"}</span></label>
            ))}
          </div>
        </div>
        <label className="field"><span>Model</span>
          <input className="input" list="pe-models" placeholder="Seedance 2.0, Kling…" value={p.model} onChange={(e) => set({ model: e.target.value })} style={{ width: 220 }} />
          <datalist id="pe-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <button type="button" className={`pl-star inline${p.favorite ? " on" : ""}`} onClick={() => set({ favorite: !p.favorite })} aria-pressed={p.favorite} title="Favourite"><IconStar /></button>
      </div>

      <section className="block pe-sec">
        <div className="db-h">
          <h2 className="h2">Prompt</h2>
          <span className="cnt">{p.prompt.length ? `${p.prompt.length.toLocaleString()} chars` : ""}</span>
          <span className="sp" />
          <button className="btn ghost" type="button" onClick={() => copy("prompt", p.prompt)} disabled={!p.prompt}><IconCopy width={14} height={14} />{copied === "prompt" ? "Copied ✓" : "Copy"}</button>
        </div>
        <textarea className="textarea pe-prompt" placeholder="Paste the full prompt…" value={p.prompt} onChange={(e) => set({ prompt: e.target.value })} autoFocus={isNew} />
        {showNeg ? (
          <>
            <div className="pe-sub">
              <span>Negative prompt</span>
              <button className="linkish" type="button" onClick={() => copy("neg", p.negative)} disabled={!p.negative}>{copied === "neg" ? "Copied ✓" : "Copy"}</button>
            </div>
            <textarea className="textarea" placeholder="What to avoid…" value={p.negative} onChange={(e) => set({ negative: e.target.value })} />
          </>
        ) : <button className="linkish" type="button" onClick={() => setShowNeg(true)} style={{ marginTop: 8 }}>+ Negative prompt</button>}
      </section>

      <section className="block pe-sec">
        <div className="db-h"><h2 className="h2">Posted at</h2><span className="cnt">{p.links.length || ""}</span></div>
        {p.links.length > 0 && (
          <div className="pe-links">
            {p.links.map((l) => (
              <div className="pe-link" key={l.url}>
                <span className="pl-link static" style={{ "--c": LINK_PLATFORMS[l.platform].color } as React.CSSProperties}>{LINK_PLATFORMS[l.platform].label}</span>
                <a href={l.url} target="_blank" rel="noreferrer" className="pe-url" title={l.url}>{l.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                <a href={l.url} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Open"><IconExternal /></a>
                <button className="icon-btn" type="button" onClick={() => set({ links: p.links.filter((x) => x.url !== l.url) })} aria-label="Remove link"><IconX /></button>
              </div>
            ))}
          </div>
        )}
        <form className="pe-add" onSubmit={(e) => { e.preventDefault(); addLinks(); }}>
          <input className="input" placeholder="Paste a TikTok, Instagram, YouTube, X… link (several at once is fine)" value={linkText}
            onChange={(e) => { setLinkText(e.target.value); setLinkErr(null); }}
            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/https?:\/\//.test(t)) { e.preventDefault(); addLinks(`${linkText} ${t}`); } }} />
          <button className="btn ghost" type="submit" disabled={!linkText.trim()}>Add</button>
        </form>
        {linkErr && <p className="err" style={{ marginTop: 6 }}>{linkErr}</p>}
      </section>

      <section className="block pe-sec">
        <div className="db-h"><h2 className="h2">Media</h2><span className="cnt">{assets.length || ""}</span></div>
        <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>Reference images, a cover frame, or the result clip. The first image is the cover in the library.</p>
        {assets.length > 0 && (
          <div className="pe-media">
            {assets.map((a, i) => (
              <figure key={a.id} className="pe-asset">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.hasThumb ? <img src={`/api/assets/${a.id}?thumb=1`} alt={a.name} /> : <span className="kit-noprev">{a.name}</span>}
                {i === 0 && <span className="pe-cover-tag">Cover</span>}
                {a.kind === "video" && <span className="pl-kind">▶</span>}
                <figcaption>
                  {i > 0 && <button type="button" className="linkish" onClick={() => setAssets((xs) => [a, ...xs.filter((x) => x.id !== a.id)])}>Make cover</button>}
                  <a className="linkish" href={`/api/assets/${a.id}?download=1`}>Save</a>
                  <button type="button" className="icon-btn" onClick={() => { setAssets((xs) => xs.filter((x) => x.id !== a.id)); setSaved(false); }} aria-label="Remove"><IconX /></button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <Uploader onAdded={(a) => { setAssets((xs) => [...xs, a]); setSaved(false); }} label="Drop images or the result video, or click to choose" />
      </section>

      <section className="block pe-sec">
        <div className="db-h"><h2 className="h2">Details</h2></div>
        <div className="pe-grid">
          <label className="field"><span>Tags</span>
            <input className="input" placeholder="fight, anime, rain…" value={tagText} onChange={(e) => { setTagText(e.target.value); setSaved(false); }} />
          </label>
          {collabs.length > 0 && (
            <div className="field"><span>Made for</span>
              <div className="pe-collabs">
                {collabs.map((c) => {
                  const on = p.collabIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" className={`tag chip-btn ${on ? "t-blue" : "t-gray"}`}
                      onClick={() => set({ collabIds: on ? p.collabIds.filter((x) => x !== c.id) : [...p.collabIds, c.id] })}>
                      <Mono collab={c} size="sm" />{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="field pe-notes"><span>Notes</span>
            <textarea className="textarea" placeholder="What worked, what to change next time, seed, settings…" value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
      </section>

      <div className="ed-bar">
        <button className="btn" onClick={save} disabled={pending}>{pending ? "Saving…" : isNew ? "Save prompt" : "Save"}</button>
        {saved && !pending && <span className="faint" style={{ fontSize: 13 }}>Saved ✓</span>}
        {err && <span className="err">{err}</span>}
        <span className="sp" style={{ flex: 1 }} />
        <span className="faint hide-m" style={{ fontSize: 12 }}>⌘S to save</span>
        {!isNew && <button className="btn ghost" onClick={version} disabled={pending} title="Copy this prompt into a new entry to iterate on">New version</button>}
        {!isNew && <button className="btn danger" onClick={remove} disabled={pending}>Delete</button>}
      </div>
    </div>
  );
}
