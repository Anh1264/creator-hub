import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { todayISO } from "./dates";
import { APP_TIMEZONE, IS_DEMO, IS_HOSTED } from "./env";
import { createClient } from "./supabase/server";

export interface CurrentUser { id: string; email: string; isAdmin: boolean }

const LOCAL_USER: CurrentUser = { id: "local", email: "local", isAdmin: true };

/**
 * The signed-in user for this request, or null. Accounts only exist for invited emails (a database
 * trigger refuses anyone else), so having a valid session is enough.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  if (IS_DEMO) return IS_HOSTED ? null : LOCAL_USER; // no open, login-less workspace on the public internet
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: profile } = await sb.from("profiles").select("is_admin").eq("id", claims.sub).maybeSingle();
  return { id: claims.sub, email: (claims.email as string | undefined) ?? "", isAdmin: !!profile?.is_admin };
});

/** Guard for server actions & pages. The proxy already redirects, but actions must re-check. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** For route handlers: same check as requireUser, but answers instead of redirecting. */
export async function isSignedIn(): Promise<boolean> {
  return !!(await currentUser());
}

/** The viewer's timezone (set by the browser in a cookie), falling back to APP_TIMEZONE. */
export const userTimezone = cache(async () => {
  const tz = (await cookies()).get("tz")?.value;
  if (tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { /* bad value */ }
  }
  return APP_TIMEZONE;
});

/** Today in the viewer's timezone, as YYYY-MM-DD. */
export const userToday = async () => todayISO(await userTimezone());
