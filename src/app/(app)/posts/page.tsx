import Link from "next/link";
import { Mono } from "@/components/bits";
import { NewPostButton } from "@/components/editor";
import { PostTable } from "@/components/post-table";
import type { Row } from "@/components/post-rows";
import { STAGES, STAGE_META, type Stage } from "@/lib/domain";
import { loadAll } from "@/lib/load";

export const metadata = { title: "All posts" };

export default async function PostsPage({ searchParams }: PageProps<"/posts">) {
  const sp = await searchParams;
  const { collabs, posts, today } = await loadAll();
  const collabId = typeof sp.collab === "string" ? sp.collab : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const byId = new Map(collabs.map((c) => [c.id, c]));

  const rows: Row[] = posts
    .filter((p) => !collabId || p.collabId === collabId)
    .filter((p) => !stage || (stage === "unlinked" ? p.stage === "posted" && !p.url : p.stage === stage))
    .sort((a, b) => (b.postedAt ?? b.dueDate ?? "").localeCompare(a.postedAt ?? a.dueDate ?? ""))
    .flatMap((p) => { const c = byId.get(p.collabId); return c ? [{ post: p, collab: c }] : []; });

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ ...(collabId ? { collab: collabId } : {}), ...(stage ? { stage } : {}), ...patch });
    for (const [k, v] of [...params]) if (!v) params.delete(k);
    const s = params.toString();
    return s ? `/posts?${s}` : "/posts";
  };

  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>All posts</b></div>
      <div className="page no-cover">
        <div className="title-row">
          <h1 className="title">All posts</h1>
          <NewPostButton label="+ New post" defaults={collabId ? { collabId } : undefined} />
        </div>
        <div className="filters">
          <Link className="chip-link" href={href({ collab: "" })} aria-current={!collabId}>All collabs</Link>
          {collabs.filter((c) => !c.archived || c.id === collabId).map((c) => (
            <Link key={c.id} className="chip-link" href={href({ collab: c.id })} aria-current={collabId === c.id}>
              <Mono collab={c} size="sm" />{c.name}
            </Link>
          ))}
        </div>
        <div className="filters">
          <Link className="chip-link" href={href({ stage: "" })} aria-current={!stage}>Any stage</Link>
          {STAGES.map((s: Stage) => (
            <Link key={s} className="chip-link" href={href({ stage: s })} aria-current={stage === s}>{STAGE_META[s].label}</Link>
          ))}
          <Link className="chip-link" href={href({ stage: "unlinked" })} aria-current={stage === "unlinked"}>Posted, no link</Link>
        </div>
        <PostTable rows={rows} today={today} />
      </div>
    </>
  );
}
