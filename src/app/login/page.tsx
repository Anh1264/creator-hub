import Link from "next/link";
import { redirect } from "next/navigation";
import { IS_DEMO } from "@/lib/env";
import { sendReset, signIn, signUp } from "./actions";
import { NewPasswordFields, PasswordField } from "./password-fields";

export const metadata = { title: "Sign in" };

type Mode = "signin" | "signup" | "forgot" | "sent";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (IS_DEMO) redirect("/");
  const sp = await searchParams;
  const mode: Mode = sp.mode === "signup" || sp.mode === "forgot" || sp.mode === "sent" ? sp.mode : "signin";
  const email = typeof sp.email === "string" ? sp.email : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  const withEmail = (m: Mode) => `/login?${new URLSearchParams(m === "signin" ? { email } : { mode: m, email })}`;

  return (
    <main className="login">
      <div className="login-card">
        <h1>Creator <em>Hub</em></h1>

        {mode === "signin" && (
          <form action={signIn} className="login-card">
            <label className="field"><span>Email</span>
              <input className="input" type="email" name="email" autoComplete="email" defaultValue={email} required autoFocus={!email} />
            </label>
            <PasswordField name="password" label="Password" autoComplete="current-password" autoFocus={!!email} />
            <button className="btn" type="submit">Sign in</button>
            <div className="login-links">
              <Link className="linkish" href={withEmail("forgot")}>Forgot password?</Link>
              <Link className="linkish" href={withEmail("signup")}>New here? Create your account</Link>
            </div>
          </form>
        )}

        {mode === "signup" && (
          <form action={signUp} className="login-card">
            <p className="muted">Creator Hub is invite-only. Use the email you were invited with and pick a password.</p>
            <label className="field"><span>Email</span>
              <input className="input" type="email" name="email" autoComplete="email" defaultValue={email} required autoFocus={!email} />
            </label>
            <NewPasswordFields autoFocus={!!email} />
            <button className="btn" type="submit">Create account</button>
            <Link className="linkish" href={withEmail("signin")}>I already have an account</Link>
          </form>
        )}

        {mode === "forgot" && (
          <form action={sendReset} className="login-card">
            <p className="muted">We&apos;ll email you a link to set a new password. Open it in this browser.</p>
            <label className="field"><span>Email</span>
              <input className="input" type="email" name="email" autoComplete="email" defaultValue={email} required autoFocus />
            </label>
            <button className="btn" type="submit">Send reset link</button>
            <Link className="linkish" href={withEmail("signin")}>Back to sign in</Link>
          </form>
        )}

        {mode === "sent" && (
          <div className="login-card">
            <p className="muted">
              If there&apos;s an account for <b>{email}</b>, a reset link is on its way. Open it in this browser to choose a new
              password. It can take a minute; check spam too.
            </p>
            <Link className="linkish" href={withEmail("signin")}>Back to sign in</Link>
          </div>
        )}

        {error && (
          <p className="err">
            {error === "link" ? "That link expired or was opened in a different browser. Ask for a new one with “Forgot password?”."
              : error === "invite" ? "That email isn't on the invite list yet. Ask for an invite, then try again."
              : error}
          </p>
        )}
      </div>
    </main>
  );
}
