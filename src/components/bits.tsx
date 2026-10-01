// Small presentational pieces shared by server and client components.
import type { CSSProperties } from "react";
import { STAGE_META, STATUS_META, type Collab, type CollabSummary, type Stage, type Status, type TagTone } from "@/lib/domain";

export function Tag({ tone, children, dot = true }: { tone: TagTone; children: React.ReactNode; dot?: boolean }) {
  return <span className={`tag t-${tone}${dot ? " dot" : ""}`}>{children}</span>;
}

export function StatusTag({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <span className={`tag dot t-${m.tone}`} title={m.hint}>{m.label}</span>;
}

export function StageTag({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return <span className={`tag dot t-${m.tone}`}>{m.label}</span>;
}

export function Mono({ collab, size }: { collab: Pick<Collab, "name" | "color">; size?: "sm" | "lg" }) {
  return (
    <span className={`mono${size ? " " + size : ""}`} style={{ "--c": collab.color } as CSSProperties} aria-hidden>
      {collab.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** One segment per required post: solid = posted, accent = ready, hatched = drafting. */
export function Ticks({ s }: { s: Pick<CollabSummary, "quota" | "posted" | "ready" | "draft"> }) {
  const n = Math.max(s.quota, s.posted, 1);
  const cells = Array.from({ length: n }, (_, i) =>
    i < s.posted ? "posted" : i < s.posted + s.ready ? "ready" : i < s.posted + s.ready + s.draft ? "draft" : "",
  );
  return (
    <div className={`ticks${s.posted > s.quota ? " over" : ""}`} role="img" aria-label={`${s.posted} of ${s.quota} posted, ${s.ready} ready, ${s.draft} drafting`}>
      {cells.map((c, i) => <i key={i} className={c} />)}
    </div>
  );
}

export function pipelineText(s: Pick<CollabSummary, "idea" | "draft" | "ready">) {
  return [s.idea && `${s.idea} idea`, s.draft && `${s.draft} drafting`, s.ready && `${s.ready} ready`]
    .filter(Boolean).join(" · ") || "Empty";
}
