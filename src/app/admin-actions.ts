"use server";
// Invite management (admins only). Uses the service-role client, so every action re-checks is_admin.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

async function admin() {
  const u = await requireUser();
  if (!u.isAdmin) throw new Error("Admins only.");
  return { u, sb: createAdminClient() };
}

export async function addInvites(raw: string, note: string): Promise<Result> {
  const { sb } = await admin();
  const emails = [...new Set(raw.toLowerCase().split(/[\s,;]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  if (!emails.length) return { ok: false, error: "No valid email addresses." };
  const { error } = await sb.from("invites").upsert(emails.map((email) => ({ email, note: note.slice(0, 120) })), { onConflict: "email", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Removes the invite. With `deleteAccount`, also deletes the user and (by cascade) all their data. */
export async function revokeInvite(email: string, deleteAccount: boolean): Promise<Result> {
  const { u, sb } = await admin();
  if (email === u.email.toLowerCase()) return { ok: false, error: "You can't remove yourself." };
  if (deleteAccount) {
    const { data: profile } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profile) {
      const { error } = await sb.auth.admin.deleteUser(profile.id);
      if (error) return { ok: false, error: error.message };
    }
  }
  const { error } = await sb.from("invites").delete().eq("email", email);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
