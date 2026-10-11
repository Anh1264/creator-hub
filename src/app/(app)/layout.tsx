import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/app/login/actions";
import { Mono } from "@/components/bits";
import { EditorProvider, NewCollabButton, NewPostButton } from "@/components/editor";
import { IconCollabs, IconCutout, IconFilm, IconHome, IconLogout, IconMusic, IconPlus, IconPosts, IconRocket, IconShrinkImage, IconShrinkVideo, IconTools, IconTranscript, IconUsers } from "@/components/icons";
import { DueWatcher } from "@/components/launch/due-watcher";
import { APP_TIMEZONE } from "@/lib/env";
import { listItems } from "@/lib/launch/store";
import { itemState, nowLocal } from "@/lib/launch/types";
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
  const now = nowLocal(APP_TIMEZONE);
  const dueCount = listItems().filter((i) => itemState(i, now) === "due").length;
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
          <div className="ws"><span className="ws-av">A</span>Aiden&apos;s Hub</div>
          <NavLink href="/" exact><IconHome /><span>Overview</span></NavLink>
          <NavLink href="/posts"><IconPosts /><span>All posts</span></NavLink>
          <NavLink href="/collabs" exact><IconCollabs /><span>All collabs</span></NavLink>
          <NavLink href="/launchpad"><IconRocket /><span className="nav-label">Launchpad</span>{dueCount > 0 && <span className="mini due-badge">{dueCount} due</span>}</NavLink>
          <NavLink href="/characters"><IconUsers /><span className="nav-label">Characters</span></NavLink>

          <div className="side-h">Collabs this month</div>
          {active.map((s) => (
            <NavLink key={s.collab.id} href={`/collabs/${s.collab.id}`}>
              <Mono collab={s.collab} />
              <span className="nav-label">{s.collab.name}</span>
              <span className="mini">{s.posted}/{s.quota}</span>
            </NavLink>
          ))}
          <NewCollabButton className="nav faint" label={<><span style={{ width: 20, textAlign: "center" }}>+</span><span>New collab</span></>} />

          <Link href="/tools" className="side-h side-link">Tools</Link>
          <NavLink href="/tools/remove-bg"><IconCutout /><span className="nav-label">Remove background</span></NavLink>
          <NavLink href="/tools/youtube-mp3"><IconMusic /><span className="nav-label">YouTube → MP3</span></NavLink>
          <NavLink href="/tools/video-download"><IconFilm /><span className="nav-label">Video downloader</span></NavLink>
          <NavLink href="/tools/transcribe"><IconTranscript /><span className="nav-label">Transcribe</span></NavLink>
          <NavLink href="/tools/compress-video"><IconShrinkVideo /><span className="nav-label">Compress video</span></NavLink>
          <NavLink href="/tools/compress-image"><IconShrinkImage /><span className="nav-label">Compress images</span></NavLink>

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
        <NavLink href="/launchpad" className=""><IconRocket /><span>Launch{dueCount > 0 ? ` (${dueCount})` : ""}</span></NavLink>
        <NavLink href="/collabs" className=""><IconCollabs /><span>Collabs</span></NavLink>
        <NavLink href="/posts" className=""><IconPosts /><span>Posts</span></NavLink>
        <NavLink href="/characters" className=""><IconUsers /><span>Cast</span></NavLink>
        <NavLink href="/tools" className=""><IconTools /><span>Tools</span></NavLink>
      </nav>
      <DueWatcher />
      <NewPostButton className="fab" label={<IconPlus aria-label="New post" />} />
    </EditorProvider>
  );
}
