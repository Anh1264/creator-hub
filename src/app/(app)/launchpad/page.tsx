import Link from "next/link";
import { Mono } from "@/components/bits";
import { IconChevron, IconFilm } from "@/components/icons";
import { NotifyButton } from "@/components/launch/due-watcher";
import { PostKit } from "@/components/launch/kit";
import { LaunchSettings } from "@/components/launch/settings";
import { addMonths, daysInMonth, isMonthKey, monthName, monthOf, monthYear } from "@/lib/dates";
import type { Collab } from "@/lib/domain";
import { APP_TIMEZONE } from "@/lib/env";
import { listAssets } from "@/lib/launch/assets";
import { listItems, listSets, programTags } from "@/lib/launch/store";
import {
  PLATFORMS, PLATFORM_META, fmtWhen, itemState, nextTime, nowLocal, type ItemState, type PlatformKey, type QueueItem,
} from "@/lib/launch/types";
import { loadAll } from "@/lib/load";

export const metadata = { title: "Launchpad" };

const STATE: Record<ItemState, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "gray" }, scheduled: { label: "Scheduled", tone: "blue" }, due: { label: "Due now", tone: "red" },
  partial: { label: "Partly posted", tone: "yellow" }, posted: { label: "Posted", tone: "green" },
};

export default async function LaunchpadPage({ searchParams }: PageProps<"/launchpad">) {
  const sp = await searchParams;
  const { collabs } = await loadAll();
  const now = nowLocal(APP_TIMEZONE);
  const view = sp.view === "calendar" ? "calendar" : "list";
  const plat = PLATFORMS.includes(sp.p as PlatformKey) ? (sp.p as PlatformKey) : null;
  const collabId = typeof sp.c === "string" && collabs.some((c) => c.id === sp.c) ? sp.c : null;
  const month = isMonthKey(sp.m) ? sp.m : monthOf(now.slice(0, 10));

  const items = listItems()
    .filter((i) => !plat || i.platforms[plat].enabled)
    .filter((i) => !collabId || i.collabIds.includes(collabId));
  const byId = new Map(collabs.map((c) => [c.id, c]));
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { view: view === "calendar" ? "calendar" : null, p: plat, c: collabId, m: sp.m && isMonthKey(sp.m) ? sp.m : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/launchpad?${s}` : "/launchpad";
  };

  const due = items.filter((i) => itemState(i, now) === "due").sort((a, b) => (nextTime(a) ?? "").localeCompare(nextTime(b) ?? ""));
  const upcoming = items.filter((i) => ["scheduled", "partial"].includes(itemState(i, now))).sort((a, b) => (nextTime(a) ?? "9").localeCompare(nextTime(b) ?? "9"));
  const drafts = items.filter((i) => itemState(i, now) === "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const posted = items.filter((i) => itemState(i, now) === "posted").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);

  // quota gaps this month for the collabs that have one
  const thisMonth = monthOf(now.slice(0, 10));
  const planned = (c: Collab) => listItems().filter((i) => i.collabIds.includes(c.id) && PLATFORMS.some((p) => {
    const pl = i.platforms[p];
    const when = (pl.status === "posted" ? pl.postedAt : pl.scheduledAt) ?? "";
    return pl.enabled && pl.status !== "skipped" && when.slice(0, 7) === thisMonth;
  })).length;

  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Launchpad</b></div>
      <div className="page no-cover">
        <div className="title-row">
          <h1 className="title">Launchpad</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
            <NotifyButton />
            <Link className="btn" href="/launchpad/new">+ New post</Link>
          </div>
        </div>
        <p className="lede">Prep posts ahead: media, caption, hashtags and a time for X, Instagram and Facebook. When it&apos;s time, everything is here to copy over — then mark it posted and it counts toward the collab.</p>

        <div className="quota-strip">
          {collabs.filter((c) => !c.archived && c.monthlyQuota > 0).map((c) => {
            const n = planned(c);
            return (
              <Link key={c.id} href={href({ c: c.id })} className={`qs${n >= c.monthlyQuota ? " ok" : ""}`}>
                <Mono collab={c} size="sm" /><span>{c.name}</span><b>{n}/{c.monthlyQuota}</b><span className="faint">this month</span>
              </Link>
            );
          })}
        </div>

        <div className="filters">
          <Link className="chip-link" href={href({ p: null })} aria-current={!plat}>All platforms</Link>
          {PLATFORMS.map((p) => <Link key={p} className="chip-link" href={href({ p })} aria-current={plat === p}>{PLATFORM_META[p].label}</Link>)}
          <span style={{ width: 8 }} />
          <Link className="chip-link" href={href({ c: null })} aria-current={!collabId}>Any collab</Link>
          {collabs.filter((c) => !c.archived).map((c) => (
            <Link key={c.id} className="chip-link" href={href({ c: c.id })} aria-current={collabId === c.id}><Mono collab={c} size="sm" />{c.name}</Link>
          ))}
        </div>

        <div className="db-h" style={{ marginTop: 8 }}>
          <div className="views">
            <Link href={href({ view: null })} aria-current={view === "list"}>List</Link>
            <Link href={href({ view: "calendar" })} aria-current={view === "calendar"}>Calendar</Link>
          </div>
        </div>

        {view === "calendar" ? (
          <Calendar items={items} month={month} now={now} href={href} />
        ) : (
          <>
            {due.length > 0 && (
              <section className="block">
                <div className="db-h"><h2 className="h2">Due now</h2><span className="cnt">{due.length}</span></div>
                {due.map((i) => (
                  <div key={i.id} className="due-item">
                    <div className="due-h">
                      <Link href={`/launchpad/${i.id}`} className="due-t">{i.title}</Link>
                      <Collabs ids={i.collabIds} byId={byId} />
                    </div>
                    <PostKit item={i} assets={listAssets(i.assetIds)} now={now}
                      only={PLATFORMS.filter((p) => i.platforms[p].status === "pending" && (i.platforms[p].scheduledAt ?? "9") <= now)} />
                  </div>
                ))}
              </section>
            )}
            <Section title="Coming up" items={upcoming} now={now} byId={byId} empty={due.length ? "Nothing else scheduled." : "Nothing scheduled yet. Prep a post and give it a time."} />
            <Section title="Drafts" items={drafts} now={now} byId={byId} />
            <Section title="Posted" items={posted} now={now} byId={byId} />
          </>
        )}

        <LaunchSettings sets={listSets()} programTags={programTags(collabs)} collabs={collabs} />
      </div>
    </>
  );
}

function Collabs({ ids, byId }: { ids: string[]; byId: Map<string, Collab> }) {
  return <span className="mini-monos">{ids.map((id) => byId.get(id)).filter(Boolean).map((c) => <Mono key={c!.id} collab={c!} size="sm" />)}</span>;
}

function Section({ title, items, now, byId, empty }: { title: string; items: QueueItem[]; now: string; byId: Map<string, Collab>; empty?: string }) {
  if (!items.length && !empty) return null;
  const days = items.map((i) => { const t = nextTime(i); return title === "Coming up" && t ? fmtWhen(t).split(" · ")[0] : ""; });
  return (
    <section className="block">
      <div className="db-h"><h2 className="h2">{title}</h2><span className="cnt">{items.length || ""}</span></div>
      {!items.length ? <div className="empty-card"><p>{empty}</p><Link className="btn" href="/launchpad/new">+ New post</Link></div> : (
        <div className="jobs">
          {items.map((i, idx) => {
            const header = days[idx] && days[idx] !== days[idx - 1] ? days[idx] : "";
            const thumb = listAssets(i.assetIds.slice(0, 1))[0];
            const st = STATE[itemState(i, now)];
            return (
              <div key={i.id}>
                {header && <div className="day-h">{header}</div>}
                <Link href={`/launchpad/${i.id}`} className="job lp-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb?.hasThumb ? <img className="jt" src={`/api/assets/${thumb.id}?thumb=1`} alt="" /> : <div className="jt"><IconFilm /></div>}
                  <div className="jb">
                    <div className="jn">{i.title}</div>
                    <div className="jm">
                      <span className={`tag dot t-${st.tone}`}>{st.label}</span>
                      {PLATFORMS.filter((p) => i.platforms[p].enabled).map((p) => {
                        const pl = i.platforms[p];
                        return (
                          <span key={p} className={`pchip s-${pl.status}`} title={`${PLATFORM_META[p].label}: ${pl.status === "posted" ? "posted" : fmtWhen(pl.scheduledAt)}`}>
                            {PLATFORM_META[p].short} {pl.status === "posted" ? "✓" : pl.status === "skipped" ? "–" : pl.scheduledAt ? fmtWhen(pl.scheduledAt).split(" · ")[1] : "—"}
                          </span>
                        );
                      })}
                      <Collabs ids={i.collabIds} byId={byId} />
                    </div>
                  </div>
                  <IconChevron width={16} height={16} className="faint" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Calendar({ items, month, now, href }: { items: QueueItem[]; month: string; now: string; href: (p: Record<string, string | null>) => string }) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = daysInMonth(month);
  const entries = new Map<string, { item: QueueItem; p: PlatformKey; time: string }[]>();
  for (const i of items) for (const p of PLATFORMS) {
    const pl = i.platforms[p];
    const when = pl.scheduledAt ?? (pl.status === "posted" ? pl.postedAt?.slice(0, 16) ?? null : null);
    if (!pl.enabled || !when || when.slice(0, 7) !== month) continue;
    const d = when.slice(0, 10);
    entries.set(d, [...(entries.get(d) ?? []), { item: i, p, time: when.slice(11) }]);
  }
  const today = now.slice(0, 10);
  return (
    <section className="block">
      <div className="month-nav">
        <Link href={href({ m: addMonths(month, -1) })}>‹</Link>
        <span style={{ color: "var(--fg)", fontWeight: 500 }}>{monthName(month)} {monthYear(month)}</span>
        <Link href={href({ m: addMonths(month, 1) })}>›</Link>
        <Link href={href({ m: null })}>Today</Link>
      </div>
      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-h">{d}</div>)}
        {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} className="cal-d empty" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`;
          const list = (entries.get(d) ?? []).sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div key={d} className={`cal-d${d === today ? " today" : ""}`}>
              <span className="cal-n">{i + 1}</span>
              {list.map((e) => (
                <Link key={`${e.item.id}${e.p}`} href={`/launchpad/${e.item.id}`} className={`cal-e s-${e.item.platforms[e.p].status}`} title={e.item.title}>
                  <b style={{ color: PLATFORM_META[e.p].color }}>{PLATFORM_META[e.p].short}</b> {e.time} {e.item.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <p className="hint">Green = posted. Posts without a time don&apos;t appear here.</p>
    </section>
  );
}
