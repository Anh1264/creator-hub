import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemEditor } from "@/components/launch/editor";
import { PostKit } from "@/components/launch/kit";
import { APP_TIMEZONE } from "@/lib/env";
import { listAssets } from "@/lib/launch/assets";
import { getItem, listSets, newItem, programTags } from "@/lib/launch/store";
import { PLATFORMS, nowLocal } from "@/lib/launch/types";
import { loadAll } from "@/lib/load";

export async function generateMetadata({ params }: PageProps<"/launchpad/[id]">) {
  const { id } = await params;
  return { title: id === "new" ? "New post" : getItem(id)?.title || "Post" };
}

export default async function LaunchItemPage({ params }: PageProps<"/launchpad/[id]">) {
  const { id } = await params;
  const { collabs } = await loadAll();
  const item = id === "new" ? newItem() : getItem(id);
  if (!item) notFound();
  const now = nowLocal(APP_TIMEZONE);
  const assets = listAssets(item.assetIds);
  const showKit = !!item.id && item.ready && PLATFORMS.some((p) => item.platforms[p].enabled);

  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/launchpad">Launchpad</Link><span>/</span><b>{item.id ? item.title : "New post"}</b></div>
      <div className="page no-cover">
        <h1 className="title">{item.id ? item.title : "New post"}</h1>
        {showKit && (
          <section className="block">
            <div className="db-h"><h2 className="h2">Post it</h2></div>
            <PostKit item={item} assets={assets} now={now} />
          </section>
        )}
        <ItemEditor
          key={item.updatedAt || "new"}
          initial={item} initialAssets={assets} collabs={collabs} sets={listSets()} programTags={programTags(collabs)}
        />
      </div>
    </>
  );
}
