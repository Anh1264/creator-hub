import Link from "next/link";
import type { CSSProperties } from "react";
import { Mono, StatusTag, Ticks, pipelineText } from "@/components/bits";
import { NewCollabButton, NewPostButton } from "@/components/editor";
import {
  IconCheckCircle, IconChevron, IconClock, IconCollabs, IconInfo, IconList, IconTable, IconWarn,
} from "@/components/icons";
import { PostedRows, TodoRows, type Row } from "@/components/post-rows";
import {
  addMonths, dayOf, daysInMonth, fmtDay, isMonthKey, lastDay, monthName, monthOf, monthShort, monthYear,
} from "@/lib/dates";
import {
  STATUS_META, byUrgency, isActiveIn, needsAttention, phaseOf, pipelineFor, postedIn, summarize,
  type CollabSummary, type Status,
} from "@/lib/domain";
import { loadAll } from "@/lib/load";

export default async function Overview({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { collabs, posts, today } = await loadAll();
  const current = monthOf(today);
  const month = isMonthKey(sp.m) ? sp.m : current;
  const view = sp.view === "table" ? "table" : "gallery";
  const phase = phaseOf(month, today);

  const active = collabs.filter((c) => isActiveIn(c, month));
  const sums = active.map((c) => summarize(c, posts, month, today)).sort(byUrgency);
  const byId = new Map(collabs.map((c) => [c.id, c]));
  const activeIds = new Set(active.map((c) => c.id));

  const delivered = sums.reduce((a, s) => a + Math.min(s.posted, s.quota), 0);
  const total = sums.reduce((a, s) => a + s.quota, 0);
  const counts = sums.reduce<Partial<Record<Status, number>>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  const attention = sums.filter(needsAttention);
  const unlinked = sums.reduce((a, s) => a + s.unlinked, 0);

  const toRow = (p: (typeof posts)[number]): Row | null => {
    const c = byId.get(p.collabId);
    return c ? { post: p, collab: c } : null;
  };
  const queue = pipelineFor(posts.filter((p) => activeIds.has(p.collabId)), month, today)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .map(toRow).filter((r): r is Row => !!r);
  const done = postedIn(posts, month)
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
    .map(toRow).filter((r): r is Row => !!r);

  const q = (m: string) => `/?${new URLSearchParams({ ...(m !== current ? { m } : {}), ...(view === "table" ? { view } : {}) })}`;
  const viewHref = (v: string) => `/?${new URLSearchParams({ ...(month !== current ? { m: month } : {}), ...(v === "table" ? { view: v } : {}) })}`;
  const tileDay = phase === "current" ? dayOf(today) : phase === "past" ? dayOf(lastDay(month)) : 1;

  return (
    <>
      <div className="crumbs">
        <span>Hub</span><span>/</span><b>Overview</b>
        <span className="sp" />
        <span className="hide-m faint">Press N for a new post</span>
      </div>
      <div className="cover" />
      <div className="page">
        <div className="page-ico"><span className="m">{monthShort(month)}</span><span className="d">{tileDay}</span></div>
        <h1 className="title">{monthName(month)} <em>{monthYear(month)}</em></h1>
        <nav className="month-nav" aria-label="Month">
          <Link href={q(addMonths(month, -1))}>← {monthShort(addMonths(month, -1))}</Link>
          {month !== current && <Link href={q(current)}>This month</Link>}
          <Link href={q(addMonths(month, 1))}>{monthShort(addMonths(month, 1))} →</Link>
        </nav>

        <div className="props">
          <div className="pk"><IconClock />Month</div>
          <div className="pv">
            {phase === "current" ? (
              <>
                <span className="monthbar"><i style={{ width: `${(dayOf(today) / daysInMonth(month)) * 100}%` }} /></span>
                <span>Day {dayOf(today)} of {daysInMonth(month)}</span>
                <span className="muted hide-m">· {daysInMonth(month) - dayOf(today) + 1} days left</span>
              </>
            ) : <span className="muted">{phase === "past" ? "Closed" : "Not started"}</span>}
          </div>
          <div className="pk"><IconCheckCircle />Delivered</div>
          <div className="pv">
            <span>{delivered} of {total} posts</span>
            {unlinked > 0 && <span className="tag t-yellow">{unlinked} missing link{unlinked > 1 ? "s" : ""}</span>}
          </div>
          <div className="pk"><IconList />Status</div>
          <div className="pv">
            {sums.length === 0 && <span className="muted">No active collabs</span>}
            {(["risk", "missed", "tight", "onpace", "ontrack", "upcoming", "done"] as Status[]).filter((k) => counts[k]).map((k) => (
              <span key={k} className={`tag dot t-${STATUS_META[k].tone}`}>{counts[k]} {STATUS_META[k].label.toLowerCase()}</span>
            ))}
          </div>
        </div>

        <Callout phase={phase} sums={sums} attention={attention} month={month} />

        <section className="block">
          <div className="db-h">
            <h2 className="h2">Collabs</h2>
            <div className="views">
              <Link href={viewHref("gallery")} aria-current={view === "gallery"}><IconCollabs />Gallery</Link>
              <Link href={viewHref("table")} aria-current={view === "table"}><IconTable />Table</Link>
            </div>
            <span className="sp" />
            <NewCollabButton label="+ New" />
          </div>
          {sums.length === 0 ? (
            <div className="empty-card">
              <p>No collabs running in {monthName(month)}.</p>
              <NewCollabButton label="Add your first collab" />
            </div>
          ) : view === "gallery" ? <Gallery sums={sums} month={month} /> : <Table sums={sums} month={month} />}
        </section>

        <section className="block">
          <div className="db-h">
            <h2 className="h2">{phase === "past" ? "Left undone" : "Up next"}</h2>
            <span className="cnt">{queue.length}</span>
            <span className="sp" />
            {phase !== "past" && <NewPostButton label="+ New" />}
          </div>
          <TodoRows rows={queue} today={today} addDefaults={phase === "past" ? false : {}} emptyText="Nothing left open." />
          {queue.length > 0 && <p className="hint">Tick the box when it&apos;s live. Click the stage tag to move it forward.</p>}
        </section>

        {done.length > 0 && (
          <section className="block">
            <details className="fold" open={phase === "past"}>
              <summary><IconChevron />Posted in {monthName(month)} · {done.length}</summary>
              <PostedRows rows={done} />
            </details>
          </section>
        )}
      </div>
    </>
  );
}

function Callout({ phase, sums, attention, month }: {
  phase: string; sums: CollabSummary[]; attention: CollabSummary[]; month: string;
}) {
  if (sums.length === 0) return null;
  if (phase === "future") {
    return <div className="callout info"><IconInfo /><div>Planning ahead — {sums.reduce((a, s) => a + s.quota, 0)} posts due across {sums.length} collabs in {monthName(month)}.</div></div>;
  }
  if (phase === "past") {
    const missed = sums.filter((s) => s.status === "missed");
    return missed.length ? (
      <div className="callout"><IconWarn /><div>
        <b>{missed.length} collab{missed.length > 1 ? "s" : ""} ended under quota.</b>
        <ul>{missed.map((s) => <li key={s.collab.id}><b>{s.collab.name}</b>: {s.posted} of {s.quota} delivered.</li>)}</ul>
      </div></div>
    ) : <div className="callout ok"><IconCheckCircle /><div><b>Every quota was met in {monthName(month)}.</b></div></div>;
  }
  if (attention.length === 0) {
    return <div className="callout ok"><IconCheckCircle /><div><b>Nothing needs attention.</b> Every collab is covered or on pace.</div></div>;
  }
  return (
    <div className="callout"><IconWarn /><div>
      <b>{attention.length} collab{attention.length > 1 ? "s need" : " needs"} attention before {fmtDay(lastDay(month))}.</b>
      <ul>
        {attention.map((s) => (
          <li key={s.collab.id}>
            <b>{s.collab.name}</b>: needs {s.remaining} more — {s.ready} ready
            {s.draft ? `, ${s.draft} drafting` : ""}{s.idea ? `, ${s.idea} still an idea` : ""}.
          </li>
        ))}
      </ul>
    </div></div>
  );
}

function needText(s: CollabSummary, month: string) {
  if (s.remaining === 0) return s.posted > s.quota ? `Quota met (+${s.posted - s.quota})` : "Quota met";
  if (s.status === "missed") return `${s.remaining} short`;
  return `${s.remaining} more by ${fmtDay(lastDay(month))}`;
}

function Gallery({ sums, month }: { sums: CollabSummary[]; month: string }) {
  return (
    <div className="gallery">
      {sums.map((s) => (
        <Link key={s.collab.id} href={`/collabs/${s.collab.id}?m=${month}`} className="g" style={{ "--c": s.collab.color } as CSSProperties}>
          <div className="g-top"><Mono collab={s.collab} size="lg" /><span className="g-name">{s.collab.name}</span><StatusTag status={s.status} /></div>
          <div className="g-num"><b>{s.posted}/{s.quota}</b><span>posted</span></div>
          <Ticks s={s} />
          <dl className="g-props">
            <dt>Platforms</dt><dd>{s.collab.platforms.join(", ") || "—"}</dd>
            <dt>Pipeline</dt><dd>{pipelineText(s)}</dd>
            <dt>Needs</dt><dd>{needText(s, month)}</dd>
          </dl>
        </Link>
      ))}
    </div>
  );
}

function Table({ sums, month }: { sums: CollabSummary[]; month: string }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Name</th><th>Status</th><th>Progress</th><th>Platforms</th><th>Pipeline</th><th>Needs</th></tr></thead>
        <tbody>
          {sums.map((s) => (
            <tr key={s.collab.id}>
              <td><Link className="nm" href={`/collabs/${s.collab.id}?m=${month}`}><Mono collab={s.collab} />{s.collab.name}</Link></td>
              <td><StatusTag status={s.status} /></td>
              <td><span className="tbar"><Ticks s={s} /><span className="num">{s.posted}/{s.quota}</span></span></td>
              <td className="num">{s.collab.platforms.join(", ") || "—"}</td>
              <td className="num">{pipelineText(s)}</td>
              <td className="num">{needText(s, month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
