import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/app/login/actions";
import { Mono } from "@/components/bits";
import { EditorProvider, NewCollabButton, NewPostButton } from "@/components/editor";
import { IconCollabs, IconHome, IconLogout, IconPlus, IconPosts, IconPrompt, IconRocket, IconTools, IconUsers } from "@/components/icons";
import { currentUser, userTimezone } from "@/lib/auth";
import { toolsFor } from "@/components/tools/registry";
import { DueWatcher } from "@/components/launch/due-watcher";
import { listItems } from "@/lib/launch/store";
import { itemState, nowLocal } from "@/lib/launch/types";
import { NavLink, ThemeToggle, TimezoneCookie } from "@/components/nav";
import { monthOf } from "@/lib/dates";
import { byUrgency, isActiveIn, summarize } from "@/lib/domain";
import { IS_DEMO, IS_HOSTED } from "@/lib/env";
import { loadAll } from "@/lib/load";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { collabs, posts, today } = await loadAll();
  const month = monthOf(today);
  const active = collabs
    .filter((c) => isActiveIn(c, month))
    .map((c) => summarize(c, posts, month, today))
    .sort(byUrgency);
  const now = nowLocal(await userTimezone());
  const dueCount = (await listItems()).filter((i) => itemState(i, now) === "due").length;
  const user = await currentUser();
  const tools = toolsFor(IS_HOSTED); // hosted: only the browser tools (the rest need ffmpeg/yt-dlp/Whisper on your computer)
  const theme = (await cookies()).get("theme")?.value;
  const initialTheme = theme === "light" || theme === "dark" ? theme : "system";

  return (
    <EditorProvider collabs={collabs} today={today} suggestedCollabId={active[0]?.collab.id}>
      {IS_DEMO && (
        <div className="demo-banner">
          Local mode — your data is saved on this computer (<code>.tools/data</code>). Add Supabase keys to <code>.env.local</code> to sync across devices.
        </div>
      )}
      <div className="app">
        <aside className="side">
          <div className="ws"><span className="ws-av">{(IS_DEMO ? "C" : user?.email.charAt(0) || "C").toUpperCase()}</span>Creator Hub</div>
          <NavLink href="/" exact><IconHome /><span>Overview</span></NavLink>
          <NavLink href="/posts"><IconPosts /><span>All posts</span></NavLink>
          <NavLink href="/collabs" exact><IconCollabs /><span>All collabs</span></NavLink>
          <NavLink href="/launchpad"><IconRocket /><span className="nav-label">Launchpad</span>{dueCount > 0 && <span className="mini due-badge">{dueCount} due</span>}</NavLink>
          <NavLink href="/characters"><IconUsers /><span className="nav-label">Characters</span></NavLink>
          <NavLink href="/prompts"><IconPrompt data-tool="prompts" /><span className="nav-label">Prompts</span></NavLink>

          <div className="side-h">Collabs this month</div>
          {active.map((s) => (
            <NavLink key={s.collab.id} href={`/collabs/${s.collab.id}`}>
              <Mono collab={s.collab} />
              <span className="nav-label">{s.collab.name}</span>
              <span className="mini">{s.posted}/{s.quota}</span>
            </NavLink>
          ))}
          <NewCollabButton className="nav faint" label={<><span style={{ width: 20, textAlign: "center" }}>+</span><span>New collab</span></>} />

          {tools.length > 0 && (
            <>
              <Link href="/tools" className="side-h side-link">Tools</Link>
              {tools.map(({ key, href, Icon, name }) => (
                <NavLink key={key} href={href}><Icon data-tool={key} /><span className="nav-label">{name}</span></NavLink>
              ))}
            </>
          )}

          <div className="side-foot">
            {!IS_DEMO && user?.isAdmin && <NavLink href="/admin"><IconUsers /><span className="nav-label">Invites</span></NavLink>}
            <ThemeToggle initial={initialTheme} />
            {!IS_DEMO && (
              <form action={signOut} title={user?.email}>
                <button className="nav" type="submit"><IconLogout /><span>Sign out</span></button>
              </form>
            )}
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <NavLink href="/" exact className=""><IconHome /><span>Overview</span></NavLink>
        <NavLink href="/launchpad" className=""><IconRocket /><span>Launch{dueCount > 0 ? ` (${dueCount})` : ""}</span></NavLink>
        <NavLink href="/collabs" className=""><IconCollabs /><span>Collabs</span></NavLink>
        <NavLink href="/posts" className=""><IconPosts /><span>Posts</span></NavLink>
        <NavLink href="/characters" className=""><IconUsers /><span>Cast</span></NavLink>
        <NavLink href="/prompts" className=""><IconPrompt /><span>Prompts</span></NavLink>
        {tools.length > 0 && <NavLink href="/tools" className=""><IconTools /><span>Tools</span></NavLink>}
      </nav>
      <DueWatcher />
      <TimezoneCookie />
      <NewPostButton className="fab" label={<IconPlus aria-label="New post" />} />
    </EditorProvider>
  );
}
