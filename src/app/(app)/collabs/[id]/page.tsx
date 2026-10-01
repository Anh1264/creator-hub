import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { StatusTag, Ticks, pipelineText } from "@/components/bits";
import { EditCollabButton, NewPostButton } from "@/components/editor";
import { IconCheckCircle, IconChevron, IconClock, IconCollabs, IconList } from "@/components/icons";
import { PostedRows, TodoRows, type Row } from "@/components/post-rows";
import { addMonths, fmtDay, isMonthKey, lastDay, monthName, monthOf, monthShort, monthYear } from "@/lib/dates";
import { isActiveIn, pipelineFor, postedIn, summarize } from "@/lib/domain";
import { loadAll } from "@/lib/load";

export default async function CollabPage({ params, searchParams }: PageProps<"/collabs/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { collabs, posts, today } = await loadAll();
  const collab = collabs.find((c) => c.id === id);
  if (!collab) notFound();

  const current = monthOf(today);
  const month = isMonthKey(sp.m) ? sp.m : current;
  const mine = posts.filter((p) => p.collabId === collab.id);
  const s = summarize(collab, mine, month, today);
  const activeNow = isActiveIn(collab, month);

  // Six-month strip ending at the selected month (or current, whichever is later).
  const end = month > current ? month : current;
  const history = Array.from({ length: 6 }, (_, i) => addMonths(end, i - 5)).map((m) => ({
    m, active: isActiveIn(collab, m), s: summarize(collab, mine, m, today),
  }));

  const toRow = (p: (typeof posts)[number]): Row => ({ post: p, collab });
  const queue = pipelineFor(mine, month, today)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).map(toRow);
  const done = postedIn(mine, month).sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).map(toRow);
  const fmtM = (m: string) => `${monthShort(m)} ${monthYear(m)}`;
  const cover = `radial-gradient(110% 150% at 85% 0%, color-mix(in srgb, ${collab.color} 38%, transparent) 0%, transparent 60%), radial-gradient(80% 120% at 5% 100%, color-mix(in srgb, ${collab.color} 22%, transparent) 0%, transparent 60%), color-mix(in srgb, ${collab.color} 10%, var(--bg))`;

  return (
    <>
      <div className="crumbs">
        <span>Hub</span><span>/</span><Link href="/collabs">Collabs</Link><span>/</span><b>{collab.name}</b>
      </div>
      <div className="cover" style={{ background: cover }} />
      <div className="page">
        <div className="page-ico mono-ico" style={{ "--c": collab.color } as CSSProperties}>{collab.name.charAt(0).toUpperCase()}</div>
        <div className="title-row">
          <h1 className="title">{collab.name}</h1>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <EditCollabButton collab={collab} />
            {!collab.archived && <NewPostButton label="+ New post" defaults={{ collabId: collab.id }} />}
          </div>
        </div>

        <div className="props">
          <div className="pk"><IconList />Quota</div>
          <div className="pv">{collab.monthlyQuota} posts / month</div>
          <div className="pk"><IconCollabs />Platforms</div>
          <div className="pv">{collab.platforms.length ? collab.platforms.map((p) => <span key={p} className="tag t-gray">{p}</span>) : <span className="muted">—</span>}</div>
          <div className="pk"><IconClock />Running</div>
          <div className="pv">{fmtM(collab.startMonth)} → {collab.endMonth ? fmtM(collab.endMonth) : "ongoing"}{collab.archived && <span className="tag t-gray">Archived</span>}</div>
          <div className="pk"><IconCheckCircle />{monthShort(month)} status</div>
          <div className="pv">{activeNow ? <><StatusTag status={s.status} /><span className="muted">{s.posted} of {s.quota} · {pipelineText(s)}</span></> : <span className="muted">Not running this month</span>}</div>
        </div>
        {collab.notes && <div className="callout info" style={{ whiteSpace: "pre-wrap" }}><div>{collab.notes}</div></div>}

        <div className="hist">
          {history.map(({ m, active, s: hs }) => (
            <Link key={m} href={`/collabs/${collab.id}${m === current ? "" : `?m=${m}`}`} aria-current={m === month}>
              <span className="hm">{monthShort(m)} {m.slice(2, 4)}</span>
              {active ? <><span className="hv">{hs.posted}/{hs.quota}</span><Ticks s={hs} /></> : <span className="hv faint">—</span>}
            </Link>
          ))}
        </div>

        <section className="block">
          <div className="db-h">
            <h2 className="h2">{monthName(month)} · up next</h2>
            <span className="cnt">{queue.length}</span>
          </div>
          <TodoRows
            rows={queue} today={today} showCollab={false}
            addDefaults={collab.archived ? false : { collabId: collab.id }}
            emptyText={`Nothing open in ${monthName(month)}.`}
          />
          {activeNow && s.remaining > 0 && month >= current && (
            <p className="hint">{s.remaining} more needed by {fmtDay(lastDay(month))}.</p>
          )}
        </section>

        <section className="block">
          <details className="fold" open>
            <summary><IconChevron />Posted in {monthName(month)} · {done.length}</summary>
            {done.length ? <PostedRows rows={done} showCollab={false} /> : <p className="faint" style={{ padding: "4px 6px" }}>Nothing yet.</p>}
          </details>
          <p className="hint"><Link className="linkish" href={`/posts?collab=${collab.id}`}>All {collab.name} posts →</Link></p>
        </section>
      </div>
    </>
  );
}
