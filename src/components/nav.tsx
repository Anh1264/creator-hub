"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconMonitor, IconMoon, IconSun } from "./icons";

export function NavLink({ href, className = "nav", exact = false, children }: {
  href: string; className?: string; exact?: boolean; children: React.ReactNode;
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link href={href} className={className} aria-current={active ? "page" : undefined}>{children}</Link>;
}

/** Tells the server the browser's timezone (cookie), so "today" and due times are local to each user. */
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
    if (current && decodeURIComponent(current) === tz) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Theme: system", light: "Theme: Paper", dark: "Theme: Dusk" };

/** Cycles system → Paper → Dusk. Stored in a cookie so the server renders the right theme (no flash). */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }, [theme]);
  const Icon = theme === "light" ? IconSun : theme === "dark" ? IconMoon : IconMonitor;
  return (
    <button
      className="nav"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])}
    >
      <Icon /><span className="nav-label">{LABEL[theme]}</span>
    </button>
  );
}
