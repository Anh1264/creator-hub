import { redirect } from "next/navigation";
import { IS_DEMO } from "@/lib/env";
import { sendCode, verifyCode } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (IS_DEMO) redirect("/");
  const sp = await searchParams;
  const step = sp.step === "code" ? "code" : "email";
  const email = typeof sp.email === "string" ? sp.email : "";
  const error = typeof sp.error === "string" ? sp.error : "";

  return (
    <main className="login">
      <div className="login-card">
        <h1>Creator <em>Hub</em></h1>
        {step === "email" ? (
          <form action={sendCode} className="login-card">
            <p className="muted">We&apos;ll email you a 6-digit code.</p>
            <label className="field"><span>Email</span>
              <input className="input" type="email" name="email" autoComplete="email" defaultValue={email} required autoFocus />
            </label>
            <button className="btn" type="submit">Send code</button>
          </form>
        ) : (
          <form action={verifyCode} className="login-card">
            <p className="muted">A code is on its way to <b>{email}</b>. Enter it below, or open the link in the email on this device.</p>
            <input type="hidden" name="email" value={email} />
            <label className="field"><span>Code</span>
              <input className="input" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required autoFocus />
            </label>
            <button className="btn" type="submit">Sign in</button>
            <a className="linkish" href="/login">Use a different email</a>
          </form>
        )}
        {error && (
          <p className="err">
            {error === "link" ? "That link expired or was opened in a different browser. Use the code instead."
              : error === "invite" ? "Creator Hub is invite-only for now, and that email isn't on the list yet. Ask for an invite, then try again."
              : error}
          </p>
        )}
      </div>
    </main>
  );
}
