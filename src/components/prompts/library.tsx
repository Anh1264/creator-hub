"use client";
// Prompt library grid: search + filters, cover image, the prompt itself, and where the result was posted.
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toggleFavorite } from "@/app/prompt-actions";
import { IconCopy, IconExternal, IconPlus, IconPrompt, IconSearch, IconStar } from "@/components/icons";
import type { Asset } from "@/lib/launch/types";
import { LINK_PLATFORMS, type PromptEntry } from "@/lib/prompts/types";
import { copyText } from "./copy";

type Kind = "all" | "video" | "image";

export function PromptLibrary({ prompts, covers, collabNames }: {
  prompts: PromptEntry[]; covers: Record<string, Asset | undefined>; collabNames: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [model, setModel] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favs, setFavs] = useState<Record<string, boolean>>(() => Object.fromEntries(prompts.map((p) => [p.id, p.favorite])));
  const [copied, setCopied] = useState<string | null>(null);
  const [, start] = useTransition();

  const models = useMemo(() => count(prompts.map((p) => p.model).filter(Boolean)), [prompts]);
  const tags = useMemo(() => count(prompts.flatMap((p) => p.tags)).slice(0, 14), [prompts]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return prompts.filter((p) => {
      if (kind !== "all" && p.kind !== kind) return false;
      if (model && p.model !== model) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (favOnly && !favs[p.id]) return false;
      if (!words.length) return true;
      const hay = [p.title, p.prompt, p.negative, p.model, p.notes, ...p.tags, ...p.collabIds.map((c) => collabNames[c] ?? "")].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [prompts, q, kind, model, tag, favOnly, favs, collabNames]);

  async function copy(p: PromptEntry) {
    await copyText(p.prompt);
    setCopied(p.id);
    setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 1600);
  }

  function star(p: PromptEntry) {
    const next = !favs[p.id];
    setFavs((f) => ({ ...f, [p.id]: next }));
    start(() => { void toggleFavorite(p.id, next); });
  }

  return (
    <>
      <div className="pl-bar">
        <label className="pl-search">
          <IconSearch />
          <input className="input" type="search" placeholder="Search prompts, models, tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search prompts" />
        </label>
        <Link href="/prompts/new" className="btn"><IconPlus width={14} height={14} />New prompt</Link>
      </div>

      <div className="pl-filters">
        {(["all", "video", "image"] as const).map((k) => (
          <button key={k} type="button" className={`tag chip-btn ${kind === k ? "t-blue" : "t-gray"}`} onClick={() => setKind(k)}>
            {k === "all" ? "All" : k === "video" ? "Video" : "Image"}
          </button>
        ))}
        <button type="button" className={`tag chip-btn ${favOnly ? "t-yellow" : "t-gray"}`} onClick={() => setFavOnly((f) => !f)}>★ Favourites</button>
        {models.length > 0 && <span className="pl-sep" />}
        {models.map(([m, n]) => (
          <button key={m} type="button" className={`tag chip-btn ${model === m ? "t-blue" : "t-gray"}`} onClick={() => setModel(model === m ? null : m)}>{m} <i>{n}</i></button>
        ))}
        {tags.length > 0 && <span className="pl-sep" />}
        {tags.map(([t]) => (
          <button key={t} type="button" className={`tag chip-btn ${tag === t ? "t-brown" : "t-gray"}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
        ))}
      </div>

      {prompts.length === 0 ? (
        <div className="empty-card pl-empty">
          <IconPrompt />
          <p>Save the prompt behind each video or image, the model you ran it on, and the links where you posted it. Search them later, copy one in a click, or start a new version from it.</p>
          <Link href="/prompts/new" className="btn"><IconPlus width={14} height={14} />Save your first prompt</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-card"><p>Nothing matches. Clear the search or filters.</p></div>
      ) : (
        <div className="pl-grid">
          {shown.map((p) => {
            const cover = covers[p.id];
            return (
              <article className="pl-card" key={p.id}>
                <Link href={`/prompts/${p.id}`} className="pl-cover" aria-label={p.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover?.hasThumb ? <img src={`/api/assets/${cover.id}?thumb=1`} alt="" loading="lazy" /> : <span className="pl-ph">{p.model || (p.kind === "video" ? "Video" : "Image")}</span>}
                  {cover?.kind === "video" && <span className="pl-kind">▶</span>}
                </Link>
                <button className={`pl-star${favs[p.id] ? " on" : ""}`} onClick={() => star(p)} title={favs[p.id] ? "Unfavourite" : "Favourite"} aria-label="Favourite" aria-pressed={!!favs[p.id]}><IconStar /></button>
                <div className="pl-body">
                  <Link href={`/prompts/${p.id}`} className="pl-title">{p.title}</Link>
                  <div className="pl-meta">
                    {p.model && <span className="tag t-gray">{p.model}</span>}
                    <span>{p.kind === "video" ? "Video" : "Image"}</span>
                    <span>{p.updatedAt.slice(0, 10)}</span>
                  </div>
                  <p className="pl-text">{p.prompt}</p>
                  {p.links.length > 0 && (
                    <div className="pl-links">
                      {p.links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="pl-link" style={{ "--c": LINK_PLATFORMS[l.platform].color } as React.CSSProperties} title={l.url}>
                          {LINK_PLATFORMS[l.platform].label}<IconExternal />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pl-foot">
                  <button className="btn ghost" onClick={() => copy(p)}><IconCopy width={14} height={14} />{copied === p.id ? "Copied ✓" : "Copy prompt"}</button>
                  <Link href={`/prompts/${p.id}`} className="linkish">Open</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function count(xs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
