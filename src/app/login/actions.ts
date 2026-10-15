"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_EMAILS, SUPABASE_SERVICE_KEY } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const back = (q: Record<string, string>) => redirect(`/login?${new URLSearchParams(q)}`);

/** Invite-only beta: the email must be on public.invites (a database trigger enforces this too). */
async function isInvited(email: string) {
  if (!SUPABASE_SERVICE_KEY) return ADMIN_EMAILS.includes(email);
  const { data } = await createAdminClient().from("invites").select("email").eq("email", email).maybeSingle();
  return !!data;
}

export async function sendCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ error: "Enter a valid email address." });
  if (!(await isInvited(email))) back({ error: "invite", email });
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const sb = await createClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) back({ error: /rate limit/i.test(error.message) ? "Too many emails sent. Wait a few minutes and try again." : error.message, email });
  back({ step: "code", email });
}

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  const sb = await createClient();
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) back({ step: "code", email, error: error.message });
  redirect("/");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
