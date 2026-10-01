"use client";
import { useState, useTransition } from "react";
import { advanceStage, markPosted, setStage } from "@/app/actions";
import { addDays, fmtDay } from "@/lib/dates";
import { STAGE_META, type Collab, type Post } from "@/lib/domain";
import { Mono } from "./bits";
import { useEditor } from "./editor";
import { IconLink, IconTick } from "./icons";

export type Row = { post: Post; collab: Pick<Collab, "id" | "name" | "color"> };

function dueLabel(due: string | null, today: string) {
  if (!due) return <span>No due date</span>;
  if (due < today) return <span className="late">Overdue · {fmtDay(due)}</span>;
  if (due === today) return <span className="late">Due today</span>;
  if (due === addDays(today, 1)) return <span>Tomorrow</span>;
  return <span>{fmtDay(due)}</span>;
}

/** "K Kiroo · TikTok · Sep 30" with consistent separators. */
function Meta({ row, showCollab, children }: { row: Row; showCollab: boolean; children: React.ReactNode }) {
  const parts: React.ReactNode[] = [];
  if (showCollab) parts.push(<span key="c" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Mono collab={row.collab} size="sm" />{row.collab.name}</span>);
  if (row.post.platform) parts.push(<span key="p">{row.post.platform}</span>);
  parts.push(<span key="x">{children}</span>);
  return (
    <div className="meta">
      {parts.map((p, i) => <span key={i} style={{ display: "contents" }}>{i > 0 && <span aria-hidden>·</span>}{p}</span>)}
    </div>
  );
}

/** Unposted work: tick = went live, stage tag = move forward. */
export function TodoRows({ rows, today, showCollab = true, addDefaults, emptyText = "Nothing in the pipeline." }: {
  rows: Row[]; today: string; showCollab?: boolean;
  addDefaults?: { collabId?: string; dueDate?: string } | false; emptyText?: string;
}) {
  const { openPost, toast } = useEditor();
  const [busy, setBusy] = useState<Record<string, "done" | "pending">>({});
  const [, start] = useTransition();

  function tick(r: Row) {
    setBusy((b) => ({ ...b, [r.post.id]: "done" }));
    const prev = r.post.stage;
    start(async () => {
      const res = await markPosted(r.post.id);
      if (!res.ok) {
        setBusy((b) => { const n = { ...b }; delete n[r.post.id]; return n; });
        return toast({ text: res.error });
      }
      toast({
        text: `“${r.post.title}” posted`,
        action: { label: "Undo", run: () => start(async () => { await setStage(r.post.id, prev); }) },
      });
    });
  }

  function advance(r: Row) {
    setBusy((b) => ({ ...b, [r.post.id]: "pending" }));
    start(async () => {
      const res = await advanceStage(r.post.id);
      setBusy((b) => { const n = { ...b }; delete n[r.post.id]; return n; });
      if (!res.ok) toast({ text: res.error });
    });
  }

  return (
    <div className="todos">
      {rows.length === 0 && addDefaults === false && <p className="faint" style={{ padding: "8px 6px" }}>{emptyText}</p>}
      {rows.map((r) => {
        const state = busy[r.post.id];
        const meta = STAGE_META[r.post.stage];
        return (
          <div key={r.post.id} className={`todo${state === "done" ? " done" : ""}${state === "pending" ? " pending" : ""}`}>
            <button className="cb" onClick={() => tick(r)} disabled={!!state} aria-label={`Mark “${r.post.title}” as posted`}><IconTick /></button>
            <div className="tt">
              <button className="ttl" onClick={() => openPost(r.post)}>{r.post.title}</button>
              <Meta row={r} showCollab={showCollab}>{dueLabel(r.post.dueDate, today)}</Meta>
            </div>
            <button className={`tag dot t-${meta.tone}`} onClick={() => advance(r)} disabled={!!state} title="Move to the next stage">
              {meta.label}
            </button>
          </div>
        );
      })}
      {addDefaults !== false && (
        <button className="add-row" onClick={() => openPost(null, addDefaults ?? {})}><span>+</span>New post</button>
      )}
    </div>
  );
}

/** Delivered posts: shows the proof link, or nags for one. */
export function PostedRows({ rows, showCollab = true }: { rows: Row[]; showCollab?: boolean }) {
  const { openPost } = useEditor();
  return (
    <div className="todos">
      {rows.map((r) => (
        <div key={r.post.id} className="todo live">
          <span className="cb" aria-hidden><IconTick /></span>
          <div className="tt">
            <button className="ttl" onClick={() => openPost(r.post)}>{r.post.title}</button>
            <Meta row={r} showCollab={showCollab}><span>Live {r.post.postedAt ? fmtDay(r.post.postedAt) : ""}</span></Meta>
          </div>
          {r.post.url ? (
            <a className="proof" href={r.post.url} target="_blank" rel="noreferrer"><IconLink />View</a>
          ) : (
            <button className="proof missing" onClick={() => openPost(r.post)}>+ Add link</button>
          )}
        </div>
      ))}
    </div>
  );
}
