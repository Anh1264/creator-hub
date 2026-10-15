import { notFound } from "next/navigation";
import { InviteManager } from "@/components/admin/invites";
import { requireUser } from "@/lib/auth";
import { IS_DEMO } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Invites" };

export default async function AdminPage() {
  if (IS_DEMO) notFound();
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  const sb = createAdminClient();
  const [{ data: invites }, { data: profiles }] = await Promise.all([
    sb.from("invites").select("*").order("invited_at", { ascending: false }),
    sb.from("profiles").select("id, email, created_at"),
  ]);
  const { data: sizes } = await sb.from("assets").select("user_id, size");
  const usage = new Map<string, number>();
  for (const r of sizes ?? []) usage.set(r.user_id, (usage.get(r.user_id) ?? 0) + Number(r.size));
  const byEmail = new Map((profiles ?? []).map((p) => [p.email, p]));
  const rows = (invites ?? []).map((i) => {
    const p = byEmail.get(i.email);
    return { email: i.email, note: i.note, isAdmin: i.is_admin, invitedAt: i.invited_at, joinedAt: p?.created_at ?? null, bytes: p ? usage.get(p.id) ?? 0 : 0 };
  });
  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Invites</b></div>
      <div className="page no-cover">
        <h1 className="title">Invites</h1>
        <p className="lede">Creator Hub is invite-only. Add someone&apos;s email here, then send them the link. They sign in with a code we email them, and start with an empty workspace of their own.</p>
        <InviteManager rows={rows} me={user.email.toLowerCase()} />
      </div>
    </>
  );
}
