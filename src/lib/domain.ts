// Core types and the quota/status logic. Pure functions — no I/O — so they're easy to test
// and reuse later (reminders, agents, API integrations).

import {
  type ISODate, type MonthKey, daysInMonth, dayOf, firstDay, monthOf,
} from "./dates";

export type Stage = "idea" | "draft" | "ready" | "posted";
export const STAGES: Stage[] = ["idea", "draft", "ready", "posted"];
export const NEXT_STAGE: Record<Exclude<Stage, "posted">, Stage> = {
  idea: "draft", draft: "ready", ready: "posted",
};
export const STAGE_META: Record<Stage, { label: string; tone: TagTone }> = {
  idea: { label: "Idea", tone: "gray" },
  draft: { label: "Drafting", tone: "brown" },
  ready: { label: "Ready", tone: "blue" },
  posted: { label: "Posted", tone: "green" },
};

export type TagTone = "gray" | "brown" | "green" | "blue" | "yellow" | "red";

export interface Collab {
  id: string;
  name: string;
  color: string;
  platforms: string[];
  monthlyQuota: number;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  notes: string;
  archived: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  collabId: string;
  title: string;
  platform: string;
  stage: Stage;
  dueDate: ISODate | null;
  postedAt: ISODate | null;
  url: string | null;
  notes: string;
  createdAt: string;
}

export type CollabInput = Omit<Collab, "id" | "createdAt">;
export type PostInput = Omit<Post, "id" | "createdAt">;

// ─── Status ────────────────────────────────────────────────────────────────
export type Status = "done" | "ontrack" | "onpace" | "tight" | "risk" | "missed" | "upcoming";

export const STATUS_META: Record<Status, { label: string; tone: TagTone; hint: string }> = {
  done: { label: "Done", tone: "green", hint: "Quota met" },
  ontrack: { label: "On track", tone: "blue", hint: "Ready posts cover what's left" },
  onpace: { label: "On pace", tone: "gray", hint: "Posting at the rate the month needs" },
  tight: { label: "Tight", tone: "yellow", hint: "Behind pace — only makes it if drafts get finished" },
  risk: { label: "At risk", tone: "red", hint: "Behind pace and the pipeline can't cover it" },
  missed: { label: "Missed", tone: "red", hint: "Month ended below quota" },
  upcoming: { label: "Upcoming", tone: "gray", hint: "Month hasn't started" },
};

export type Phase = "past" | "current" | "future";

export function phaseOf(month: MonthKey, today: ISODate): Phase {
  const cur = monthOf(today);
  return month < cur ? "past" : month > cur ? "future" : "current";
}

export function isActiveIn(c: Collab, month: MonthKey) {
  return !c.archived && c.startMonth <= month && (c.endMonth === null || c.endMonth >= month);
}

/** Posts that count toward `month` (posted in that month). */
export function postedIn(posts: Post[], month: MonthKey) {
  return posts.filter((p) => p.stage === "posted" && p.postedAt && monthOf(p.postedAt) === month);
}

/**
 * Unposted work that belongs to `month`:
 * due in that month, plus — for the current month only — anything overdue or undated.
 */
export function pipelineFor(posts: Post[], month: MonthKey, today: ISODate) {
  const isCurrent = phaseOf(month, today) === "current";
  return posts.filter((p) => {
    if (p.stage === "posted") return false;
    if (p.dueDate && monthOf(p.dueDate) === month) return true;
    if (!isCurrent) return false;
    return !p.dueDate || p.dueDate < firstDay(month);
  });
}

export interface CollabSummary {
  collab: Collab;
  quota: number;
  posted: number;
  ready: number;
  draft: number;
  idea: number;
  remaining: number;
  status: Status;
  unlinked: number; // posted this month without a proof URL
}

export function summarize(c: Collab, allPosts: Post[], month: MonthKey, today: ISODate): CollabSummary {
  const mine = allPosts.filter((p) => p.collabId === c.id);
  const done = postedIn(mine, month);
  const pipe = pipelineFor(mine, month, today);
  const n = (s: Stage) => pipe.filter((p) => p.stage === s).length;
  const posted = done.length, ready = n("ready"), draft = n("draft"), idea = n("idea");
  const quota = c.monthlyQuota;
  const remaining = Math.max(0, quota - posted);
  const phase = phaseOf(month, today);

  let status: Status;
  if (remaining === 0) status = "done";
  else if (phase === "past") status = "missed";
  else if (phase === "future") status = "upcoming";
  else if (ready >= remaining) status = "ontrack";
  else {
    // Expected output by today if posting evenly across the month.
    const expected = Math.floor((quota * dayOf(today)) / daysInMonth(month));
    if (posted >= expected) status = "onpace";
    else if (ready + draft >= remaining) status = "tight";
    else status = "risk";
  }

  return {
    collab: c, quota, posted, ready, draft, idea, remaining, status,
    unlinked: done.filter((p) => !p.url).length,
  };
}

const RANK: Record<Status, number> = { risk: 0, missed: 0, tight: 1, onpace: 2, ontrack: 3, upcoming: 4, done: 5 };
export const byUrgency = (a: CollabSummary, b: CollabSummary) =>
  RANK[a.status] - RANK[b.status] || a.collab.name.localeCompare(b.collab.name);

export const needsAttention = (s: CollabSummary) => s.status === "risk" || s.status === "tight";

export const PLATFORM_PRESETS = [
  "Instagram", "TikTok", "YouTube", "YT Shorts", "X", "Threads", "Facebook", "LinkedIn",
];

export const COLOR_PRESETS = [
  "#B5532C", "#B04A63", "#7B4B94", "#3F5BA9", "#1F7A74", "#3B7A4A", "#B7862B", "#5A6472",
];
