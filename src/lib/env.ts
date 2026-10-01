// Central place for configuration. Server-side only (client code must not import this).
import { todayISO } from "./dates";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** No Supabase configured → run on in-memory sample data with no login. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_KEY;

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Los_Angeles";

export const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email: string) {
  return ALLOWED_EMAILS.length > 0 && ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

/** Today in the app timezone, as YYYY-MM-DD. */
export const today = () => todayISO(APP_TIMEZONE);
