"use client";
// Polls for posts whose time has come: updates the tab title and (if allowed) shows a desktop notification.
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

type Due = { id: string; title: string; platform: string; at: string };
const KEY = "hub.notified";

export function DueWatcher() {
  const router = useRouter();
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/launchpad/due", { cache: "no-store" });
        if (!res.ok) return;
        const { due } = (await res.json()) as { due: Due[] };
        if (stop) return;
        document.title = due.length ? `(${due.length}) ${document.title.replace(/^\(\d+\)\s*/, "") || base}` : document.title.replace(/^\(\d+\)\s*/, "");
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        let seen: string[] = [];
        try { seen = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { /* private mode */ }
        for (const d of due) {
          const k = `${d.id}:${d.platform}:${d.at}`;
          if (seen.includes(k)) continue;
          const n = new Notification(`Time to post on ${d.platform}`, { body: d.title, tag: k });
          n.onclick = () => { window.focus(); router.push(`/launchpad/${d.id}`); };
          seen.push(k);
        }
        try { localStorage.setItem(KEY, JSON.stringify(seen.slice(-200))); } catch { /* ignore */ }
      } catch { /* offline — try again next tick */ }
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [router]);
  return null;
}

export function NotifyButton() {
  const browserPerm = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unknown",
  );
  const [asked, setPerm] = useState<string | null>(null);
  const perm = asked ?? browserPerm;
  if (perm === "unknown") return null;
  if (perm === "granted") return <span className="hint" style={{ marginTop: 0 }}>🔔 Desktop alerts on</span>;
  if (perm === "unsupported") return null;
  return (
    <button className="btn ghost" onClick={async () => setPerm(await Notification.requestPermission())} disabled={perm === "denied"}
      title={perm === "denied" ? "Blocked in your browser settings" : "Get a desktop alert when a post is due (while the hub is open)"}>
      {perm === "denied" ? "Alerts blocked" : "Turn on alerts"}
    </button>
  );
}
