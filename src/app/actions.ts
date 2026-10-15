"use server";
// All mutations go through here. Every action re-checks auth (the proxy alone isn't enough).
import { revalidatePath } from "next/cache";
import { requireUser, userToday } from "@/lib/auth";
import { repo } from "@/lib/data";
import { isISODate, isMonthKey } from "@/lib/dates";
import { NEXT_STAGE, STAGES, type CollabInput, type PostInput, type Stage } from "@/lib/domain";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (error: string): ActionResult => ({ ok: false, error });
const refresh = () => revalidatePath("/", "layout");

function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProto).toString();
  } catch {
    return null;
  }
}

// ─── Posts ─────────────────────────────────────────────────────────────────
export async function savePost(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const collabId = str(fd, "collabId");
  const title = str(fd, "title");
  const stage = str(fd, "stage") as Stage;
  const dueDate = str(fd, "dueDate");
  const postedAt = str(fd, "postedAt");
  const rawUrl = str(fd, "url");

  if (!title) return fail("Give the post a title.");
  if (title.length > 200) return fail("Title is too long.");
  if (!STAGES.includes(stage)) return fail("Unknown stage.");
  if (!(await repo.getCollab(collabId))) return fail("Pick a collab.");
  if (dueDate && !isISODate(dueDate)) return fail("Due date looks wrong.");
  if (postedAt && !isISODate(postedAt)) return fail("Posted date looks wrong.");
  const url = normalizeUrl(rawUrl);
  if (rawUrl && !url) return fail("That link doesn't look like a URL.");

  const input: PostInput = {
    collabId, title, stage,
    platform: str(fd, "platform").slice(0, 60),
    dueDate: dueDate || null,
    postedAt: stage === "posted" ? postedAt || (await userToday()) : null,
    url,
    notes: str(fd, "notes").slice(0, 4000),
  };

  if (id) {
    if (!(await repo.getPost(id))) return fail("That post no longer exists.");
    await repo.updatePost(id, input);
    refresh();
    return { ok: true, id };
  }
  const created = await repo.createPost(input);
  refresh();
  return { ok: true, id: created.id };
}

export async function deletePost(id: string): Promise<ActionResult> {
  await requireUser();
  await repo.deletePost(id);
  refresh();
  return { ok: true };
}

/** Checkbox in "Up next": mark live today. */
export async function markPosted(id: string): Promise<ActionResult> {
  await requireUser();
  const p = await repo.getPost(id);
  if (!p) return fail("Post not found.");
  await repo.updatePost(id, { stage: "posted", postedAt: (await userToday()) });
  refresh();
  return { ok: true, id };
}

/** Click on a stage tag: idea → drafting → ready → posted. */
export async function advanceStage(id: string): Promise<ActionResult> {
  await requireUser();
  const p = await repo.getPost(id);
  if (!p) return fail("Post not found.");
  if (p.stage === "posted") return { ok: true, id };
  const next = NEXT_STAGE[p.stage];
  await repo.updatePost(id, { stage: next, postedAt: next === "posted" ? (await userToday()) : null });
  refresh();
  return { ok: true, id };
}

/** Undo for the toast after marking something posted. */
export async function setStage(id: string, stage: Stage): Promise<ActionResult> {
  await requireUser();
  if (!STAGES.includes(stage)) return fail("Unknown stage.");
  await repo.updatePost(id, { stage, postedAt: stage === "posted" ? (await userToday()) : null });
  refresh();
  return { ok: true, id };
}

export async function setPostUrl(id: string, rawUrl: string): Promise<ActionResult> {
  await requireUser();
  const url = normalizeUrl(rawUrl.trim());
  if (rawUrl.trim() && !url) return fail("That link doesn't look like a URL.");
  await repo.updatePost(id, { url });
  refresh();
  return { ok: true, id };
}

// ─── Collabs ───────────────────────────────────────────────────────────────
export async function saveCollab(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const color = str(fd, "color");
  const quota = Number(str(fd, "monthlyQuota"));
  const startMonth = str(fd, "startMonth");
  const endMonth = str(fd, "endMonth");
  const platforms = [
    ...fd.getAll("platforms").map(String),
    ...str(fd, "otherPlatforms").split(","),
  ].map((p) => p.trim()).filter(Boolean);

  if (!name) return fail("Give the collab a name.");
  if (name.length > 80) return fail("Name is too long.");
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return fail("Pick a color.");
  if (!Number.isInteger(quota) || quota < 0 || quota > 500) return fail("Posts per month must be a whole number.");
  if (!isMonthKey(startMonth)) return fail("Pick a start month.");
  if (endMonth && !isMonthKey(endMonth)) return fail("End month looks wrong.");
  if (endMonth && endMonth < startMonth) return fail("End month is before the start month.");

  const input: CollabInput = {
    name, color, monthlyQuota: quota, startMonth,
    endMonth: endMonth || null,
    platforms: [...new Set(platforms)].slice(0, 20),
    notes: str(fd, "notes").slice(0, 4000),
    archived: fd.get("archived") === "on",
  };

  if (id) {
    if (!(await repo.getCollab(id))) return fail("That collab no longer exists.");
    await repo.updateCollab(id, input);
    refresh();
    return { ok: true, id };
  }
  const created = await repo.createCollab(input);
  refresh();
  return { ok: true, id: created.id };
}

export async function deleteCollab(id: string): Promise<ActionResult> {
  await requireUser();
  await repo.deleteCollab(id);
  refresh();
  return { ok: true };
}
