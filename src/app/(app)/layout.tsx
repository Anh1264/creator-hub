import { cookies } from "next/headers";
import { signOut } from "@/app/login/actions";
import { Mono } from "@/components/bits";
import { EditorProvider, NewCollabButton, NewPostButton } from "@/components/editor";
import { IconCollabs, IconHome, IconLogout, IconPlus, IconPosts } from "@/components/icons";
import { NavLink, ThemeToggle } from "@/components/nav";
import { monthOf } from "@/lib/dates";
import { byUrgency, isActiveIn, summarize } from "@/lib/domain";
import { IS_DEMO } from "@/lib/env";
import { loadAll } from "@/lib/load";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { collabs, posts, today } = await loadAll();
  const month = monthOf(today);
  const active = collabs
    .filter((c) => isActiveIn(c, month))
    .map((c) => summarize(c, posts, month, today))
    .sort(byUrgency);
  const theme = (await cookies()).get("theme")?.value;
  const initialTheme = theme === "light" || theme === "dark" ? theme : "system";

  return (
    <EditorProvider collabs={collabs} today={today} suggestedCollabId={active[0]?.collab.id}>
      {IS_DEMO && (
        <div className="demo-banner">
          Demo mode — sample data in memory, resets on restart. Add Supabase keys to <code>.env.local</code> to go live.
        </div>
      )}
      <div className="app">
        <aside className="side">
          <div className="ws"><span className="ws-av">A</span>Aiden&apos;s Hub</div>
          <NavLink href="/" exact><IconHome /><span>Overview</span></NavLink>
          <NavLink href="/posts"><IconPosts /><span>All posts</span></NavLink>
          <NavLink href="/collabs" exact><IconCollabs /><span>All collabs</span></NavLink>

          <div className="side-h">Collabs this month</div>
          {active.map((s) => (
            <NavLink key={s.collab.id} href={`/collabs/${s.collab.id}`}>
              <Mono collab={s.collab} />
              <span className="nav-label">{s.collab.name}</span>
              <span className="mini">{s.posted}/{s.quota}</span>
            </NavLink>
          ))}
          <NewCollabButton className="nav faint" label={<><span style={{ width: 20, textAlign: "center" }}>+</span><span>New collab</span></>} />

          <div className="side-foot">
            <ThemeToggle initial={initialTheme} />
            {!IS_DEMO && (
              <form action={signOut}>
                <button className="nav" type="submit"><IconLogout /><span>Sign out</span></button>
              </form>
            )}
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <NavLink href="/" exact className=""><IconHome /><span>Overview</span></NavLink>
        <NavLink href="/collabs" className=""><IconCollabs /><span>Collabs</span></NavLink>
        <NavLink href="/posts" className=""><IconPosts /><span>Posts</span></NavLink>
      </nav>
      <NewPostButton className="fab" label={<IconPlus aria-label="New post" />} />
    </EditorProvider>
  );
}
