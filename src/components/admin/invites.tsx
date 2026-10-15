"use client";
import { useState, useTransition } from "react";
import { addInvites, revokeInvite } from "@/app/admin-actions";
import { fmtBytes } from "@/lib/tools/shared";

type Row = { email: string; note: string; isAdmin: boolean; invitedAt: string; joinedAt: string | null; bytes: number };

export function InviteManager({ rows, me }: { rows: Row[]; me: string }) {
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await addInvites(emails, note);
      setMsg(r.ok ? { ok: true, text: "Invited. Send them this site\u2019s link: they click “Create account” and pick a password." } : { ok: false, text: r.error });
      if (r.ok) { setEmails(""); setNote(""); }
    });
  }
  function revoke(r: Row) {
    const del = !!r.joinedAt && confirm(`Also delete ${r.email}'s account and ALL their data? Cancel = only remove the invite.`);
    if (!del && !confirm(`Remove the invite for ${r.email}?${r.joinedAt ? " They keep their account until you delete it." : ""}`)) return;
    start(async () => {
      const res = await revokeInvite(r.email, del);
      setMsg(res.ok ? { ok: true, text: del ? "Account deleted." : "Invite removed." } : { ok: false, text: res.error });
    });
  }

  return (
    <>
      <form className="inv-add" onSubmit={add}>
        <input className="input" placeholder="email@example.com, another@example.com" value={emails} onChange={(e) => setEmails(e.target.value)} aria-label="Emails" />
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" style={{ maxWidth: 220 }} />
        <button className="btn" disabled={pending || !emails.trim()}>Invite</button>
      </form>
      {msg && <p className={msg.ok ? "hint" : "err"} style={{ marginTop: 8 }}>{msg.text}</p>}

      <section className="block" style={{ marginTop: 28 }}>
        <div className="db-h"><h2 className="h2">People</h2><span className="cnt">{rows.length}</span></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Email</th><th>Status</th><th className="hide-m">Storage</th><th className="hide-m">Note</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email}>
                <td>{r.email}{r.isAdmin && <span className="tag t-brown" style={{ marginLeft: 8 }}>Admin</span>}</td>
                <td>{r.joinedAt ? <span className="tag dot t-green">Joined {r.joinedAt.slice(0, 10)}</span> : <span className="tag dot t-gray">Invited {r.invitedAt.slice(0, 10)}</span>}</td>
                <td className="hide-m">{r.joinedAt ? fmtBytes(r.bytes) : ""}</td>
                <td className="hide-m faint">{r.note}</td>
                <td style={{ textAlign: "right" }}>{r.email !== me && <button className="btn danger" onClick={() => revoke(r)} disabled={pending}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
