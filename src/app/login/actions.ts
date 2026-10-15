"use server";
// Email + password sign-in. Accounts are invite-only: "Create account" only works for an email on
// public.invites, and the account is created server-side (service role, email already confirmed), so
// nobody waits for a confirmation email. Email is only used for "Forgot password".
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SUPABASE_SERVICE_KEY } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const back = (q: Record<string, string>): never => redirect(`/login?${new URLSearchParams(q)}`);
const MIN_PASSWORD = 8;

function read(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

/** Invite-only beta: the email must be on public.invites (a database trigger enforces this too). */
async function isInvited(email: string) {
  const { data } = await createAdminClient().from("invites").select("email").eq("email", email).maybeSingle();
  return !!data;
}

export async function signIn(formData: FormData) {
  const { email, password } = read(formData);
  if (!validEmail(email) || !password) back({ error: "Enter your email and password.", email });
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    back({
      email,
      error: /invalid login credentials/i.test(error.message)
        ? "Wrong email or password. New here? Create your account. Forgot it? Reset it."
        : /rate limit|too many/i.test(error.message) ? "Too many tries. Wait a minute and try again." : error.message,
    });
  }
  redirect("/");
}

export async function signUp(formData: FormData) {
  const { email, password } = read(formData);
  const q = { mode: "signup", email };
  if (!validEmail(email)) back({ ...q, error: "Enter a valid email address." });
  if (password.length < MIN_PASSWORD) back({ ...q, error: `Use at least ${MIN_PASSWORD} characters for your password.` });
  if (password.length > 72) back({ ...q, error: "That password is too long (72 characters max)." });
  if (!SUPABASE_SERVICE_KEY) back({ ...q, error: "Sign-up isn't set up on this server (SUPABASE_SERVICE_ROLE_KEY is missing)." });
  if (!(await isInvited(email))) back({ ...q, error: "invite" });

  const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) {
      back({ email, error: "You already have an account. Sign in, or use “Forgot password?” to set a new one." });
    }
    back({ ...q, error: /password/i.test(error.message) ? error.message : `Couldn't create the account: ${error.message}` });
  }
  const sb = await createClient();
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) back({ email, error: "Account created. Sign in to continue." });
  redirect("/");
}

export async function sendReset(formData: FormData) {
  const { email } = read(formData);
  if (!validEmail(email)) back({ mode: "forgot", error: "Enter a valid email address." });
  const sb = await createClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/callback?next=/login/reset` });
  if (error && /rate limit|too many/i.test(error.message)) {
    back({ mode: "forgot", email, error: "Too many emails sent. Wait a while and try again." });
  }
  // Same answer whether or not the account exists, so this can't be used to probe for emails.
  back({ mode: "sent", email });
}

export async function setNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const again = (error: string): never => redirect(`/login/reset?${new URLSearchParams({ error })}`);
  if (password.length < MIN_PASSWORD) again(`Use at least ${MIN_PASSWORD} characters.`);
  if (password.length > 72) again("That password is too long (72 characters max).");
  if (password !== confirm) again("The two passwords don't match.");
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) again(/session|jwt|auth/i.test(error.message) ? "This reset link has expired. Ask for a new one." : error.message);
  redirect("/");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
