"use client";
import { fmtDay } from "@/lib/dates";
import { STAGE_META } from "@/lib/domain";
import { Mono } from "./bits";
import { useEditor } from "./editor";
import { IconLink } from "./icons";
import type { Row } from "./post-rows";

export function PostTable({ rows, today }: { rows: Row[]; today: string }) {
  const { openPost } = useEditor();
  if (rows.length === 0) return <p className="faint" style={{ padding: "8px 2px" }}>No posts match.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Title</th><th>Collab</th><th>Stage</th><th>Platform</th><th>Due</th><th>Live</th><th>Link</th></tr></thead>
        <tbody>
          {rows.map(({ post: p, collab: c }) => {
            const m = STAGE_META[p.stage];
            const late = p.stage !== "posted" && p.dueDate && p.dueDate < today;
            return (
              <tr key={p.id}>
                <td className="wrap"><button className="ttl" onClick={() => openPost(p)}>{p.title}</button></td>
                <td><span className="nm"><Mono collab={c} size="sm" />{c.name}</span></td>
                <td><span className={`tag dot t-${m.tone}`}>{m.label}</span></td>
                <td className="num">{p.platform || "—"}</td>
                <td className={`num${late ? " late" : ""}`}>{p.dueDate ? fmtDay(p.dueDate) : "—"}</td>
                <td className="num">{p.postedAt ? fmtDay(p.postedAt) : "—"}</td>
                <td>
                  {p.url ? <a className="proof" href={p.url} target="_blank" rel="noreferrer"><IconLink />View</a>
                    : p.stage === "posted" ? <button className="proof missing" onClick={() => openPost(p)}>+ Add</button>
                    : <span className="faint">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
