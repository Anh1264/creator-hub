import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { Mono, StatusTag } from "@/components/bits";
import { NewCollabButton } from "@/components/editor";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/nav";
import { IconLogout } from "@/components/icons";
import { monthOf, monthShort, monthYear } from "@/lib/dates";
import { byUrgency, isActiveIn, summarize, type Collab } from "@/lib/domain";
import { IS_DEMO } from "@/lib/env";
import { loadAll } from "@/lib/load";

export const metadata = { title: "Collabs" };

const fmtMonth = (m: string) => `${monthShort(m)} ${monthYear(m)}`;

export default async function CollabsPage() {
  const { collabs, posts, today } = await loadAll();
  const month = monthOf(today);
  const running = collabs.filter((c) => isActiveIn(c, month)).map((c) => summarize(c, posts, month, today)).sort(byUrgency);
  const notRunning = collabs.filter((c) => !isActiveIn(c, month));
  const theme = (await cookies()).get("theme")?.value;

  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Collabs</b></div>
      <div className="page no-cover">
        <div className="title-row">
          <h1 className="title">Collabs</h1>
          <NewCollabButton />
        </div>

        <section className="block">
          <div className="db-h"><h2 className="h2">Running this month</h2><span className="cnt">{running.length}</span></div>
          {running.length === 0 ? (
            <div className="empty-card"><p>No collabs yet. Add one with its monthly post count.</p><NewCollabButton label="Add a collab" /></div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>This month</th><th>Status</th><th>Quota</th><th>Running</th></tr></thead>
                <tbody>
                  {running.map((s) => (
                    <tr key={s.collab.id}>
                      <td><Link className="nm" href={`/collabs/${s.collab.id}`}><Mono collab={s.collab} />{s.collab.name}</Link></td>
                      <td className="num">{s.posted}/{s.quota}</td>
                      <td><StatusTag status={s.status} /></td>
                      <td className="num">{s.quota} / month</td>
                      <td className="num">{range(s.collab)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {notRunning.length > 0 && (
          <section className="block">
            <div className="db-h"><h2 className="h2">Ended, upcoming &amp; archived</h2><span className="cnt">{notRunning.length}</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>State</th><th>Quota</th><th>Running</th></tr></thead>
                <tbody>
                  {notRunning.map((c) => (
                    <tr key={c.id}>
                      <td><Link className="nm" href={`/collabs/${c.id}`}><Mono collab={c} />{c.name}</Link></td>
                      <td className="num">{c.archived ? "Archived" : c.startMonth > month ? "Upcoming" : "Ended"}</td>
                      <td className="num">{c.monthlyQuota} / month</td>
                      <td className="num">{range(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* The sidebar is hidden on phones, so its settings live here too. */}
        <section className="block only-m">
          <div className="db-h"><h2 className="h2">Settings</h2></div>
          <ThemeToggle initial={theme === "light" || theme === "dark" ? theme : "system"} />
          {!IS_DEMO && (
            <form action={signOut}><button className="nav" type="submit"><IconLogout /><span>Sign out</span></button></form>
          )}
        </section>
      </div>
    </>
  );
}

function range(c: Collab) {
  return `${fmtMonth(c.startMonth)} → ${c.endMonth ? fmtMonth(c.endMonth) : "ongoing"}`;
}
