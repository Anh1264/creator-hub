"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function sendCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Same response whether or not the email is allowed — don't reveal the allowlist.
  if (email && isAllowedEmail(email)) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const sb = await createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?step=code&email=${encodeURIComponent(email)}`);
}

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  if (!isAllowedEmail(email)) redirect("/login?error=Not%20allowed");
  const sb = await createClient();
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
