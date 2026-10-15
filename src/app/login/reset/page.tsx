import Link from "next/link";
import { redirect } from "next/navigation";
import { IS_DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "../actions";
import { NewPasswordFields } from "../password-fields";

export const metadata = { title: "New password" };

/** Reached from the "Forgot password?" email (via /auth/callback, which signs the person in first). */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/login/reset">) {
  if (IS_DEMO) redirect("/");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : "";
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;

  return (
    <main className="login">
      <div className="login-card">
        <h1>Creator <em>Hub</em></h1>
        {email ? (
          <form action={setNewPassword} className="login-card">
            <p className="muted">Choose a new password for <b>{email}</b>.</p>
            <input type="hidden" name="username" value={email} autoComplete="username" />
            <NewPasswordFields autoFocus label="New password" />
            <button className="btn" type="submit">Save password</button>
          </form>
        ) : (
          <div className="login-card">
            <p className="muted">This reset link has expired or was opened in a different browser.</p>
            <Link className="btn" href="/login?mode=forgot">Send a new link</Link>
          </div>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </main>
  );
}
