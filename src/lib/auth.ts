import "server-only";
import { redirect } from "next/navigation";
import { IS_DEMO, isAllowedEmail } from "./env";
import { createClient } from "./supabase/server";

/** Guard for server actions & pages. The proxy already redirects, but actions must re-check. */
export async function requireUser(): Promise<{ email: string } | never> {
  if (IS_DEMO) return { email: "demo" };
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  if (!data?.claims || !isAllowedEmail(email)) redirect("/login");
  return { email };
}

/** For route handlers: same check as requireUser, but answers instead of redirecting. */
export async function isSignedIn(): Promise<boolean> {
  if (IS_DEMO) return true;
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  return !!data?.claims && isAllowedEmail(email);
}
