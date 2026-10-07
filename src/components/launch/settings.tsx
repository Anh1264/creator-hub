"use client";
// Hashtag sets + the tags each program requires (bottom of the Launchpad page).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteHashtagSet, saveHashtagSet, saveProgramTags } from "@/app/launch-actions";
import { Mono } from "@/components/bits";
import { IconX } from "@/components/icons";
import type { Collab } from "@/lib/domain";
import type { HashtagSet, ProgramTags } from "@/lib/launch/types";

export function LaunchSettings({ sets, programTags, collabs }: { sets: HashtagSet[]; programTags: ProgramTags; collabs: Collab[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setErr(null);
    const r = await fn();
    if (!r.ok) setErr(r.error ?? "Failed");
    else { after?.(); router.refresh(); }
  });

  return (
    <>
      <section className="block">
        <div className="db-h"><h2 className="h2">Hashtag sets</h2><span className="cnt">{sets.length || ""}</span></div>
        <div className="status-list">
          {sets.map((s) => (
            <div className="status-row" key={s.id}>
              <span className="sn" style={{ width: 150 }}>{s.name}</span>
              <span className="sv" title={s.tags.join(" ")}>{s.tags.join(" ")}</span>
              <button className="icon-btn" onClick={() => run(() => deleteHashtagSet(s.id))} aria-label="Delete set" title="Delete"><IconX /></button>
            </div>
          ))}
        </div>
        <form className="set-form" onSubmit={(e) => { e.preventDefault(); run(() => saveHashtagSet({ name, tags }), () => { setName(""); setTags(""); }); }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name, e.g. AI animation" style={{ maxWidth: 220 }} />
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#aianimation #aivideo #shortfilm" />
          <button className="btn ghost" disabled={pending}>Add set</button>
        </form>
      </section>

      <section className="block">
        <div className="db-h"><h2 className="h2">Program tags</h2></div>
        <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>Tags a program requires in your caption. Posts that count toward that program get a warning (and a one-click fix) when they&apos;re missing.</p>
        <div className="status-list">
          {collabs.filter((c) => !c.archived).map((c) => <ProgramRow key={c.id} collab={c} initial={(programTags[c.id] ?? []).join(" ")} onSave={(v) => run(() => saveProgramTags(c.id, v))} pending={pending} />)}
        </div>
        {err && <p className="err">{err}</p>}
      </section>
    </>
  );
}

function ProgramRow({ collab, initial, onSave, pending }: { collab: Collab; initial: string; onSave: (v: string) => void; pending: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <form className="status-row" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <span className="sn" style={{ width: 150, display: "flex", gap: 8, alignItems: "center" }}><Mono collab={collab} size="sm" />{collab.name}</span>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="none" style={{ flex: 1 }} />
      <button className="btn ghost" disabled={pending || v === initial}>Save</button>
    </form>
  );
}
