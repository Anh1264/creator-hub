"use client";
// Password inputs for the login pages: an eye button to show/hide what you typed, and for new passwords
// a second "repeat it" field that has to match before the form will submit.
import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";

export function PasswordField({ name, label, autoComplete, autoFocus, minLength, maxLength, onValue, invalid }: {
  name: string; label: string; autoComplete: string; autoFocus?: boolean; minLength?: number; maxLength?: number;
  onValue?: (v: string) => void; invalid?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field"><span>{label}</span>
      <span className="pw">
        <input
          className="input" type={show ? "text" : "password"} name={name} autoComplete={autoComplete} autoFocus={autoFocus}
          minLength={minLength} maxLength={maxLength} required spellCheck={false} autoCapitalize="none"
          onChange={(e) => { onValue?.(e.target.value); e.target.setCustomValidity(invalid ?? ""); }}
          ref={(el) => { el?.setCustomValidity(invalid ?? ""); }}
        />
        <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"} aria-pressed={show}>
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </span>
    </label>
  );
}

/** New password + repeat. The form can't be submitted until both match (the server checks again). */
export function NewPasswordFields({ autoFocus, label = "Password" }: { autoFocus?: boolean; label?: string }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again.length > 0 && pw !== again;
  const short = pw.length > 0 && pw.length < 8;
  return (
    <>
      <PasswordField name="password" label={label} autoComplete="new-password" autoFocus={autoFocus} minLength={8} maxLength={72} onValue={setPw} />
      <PasswordField name="confirm" label="Repeat password" autoComplete="new-password" minLength={8} maxLength={72} onValue={setAgain}
        invalid={pw !== again ? "The two passwords don't match." : undefined} />
      <p className={`hint pw-hint${mismatch ? " bad" : again && !mismatch ? " good" : ""}`}>
        {mismatch ? "The two passwords don't match." : again && !short ? "Passwords match." : "At least 8 characters."}
      </p>
    </>
  );
}
