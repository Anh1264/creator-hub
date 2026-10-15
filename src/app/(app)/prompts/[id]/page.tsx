import Link from "next/link";
import { notFound } from "next/navigation";
import { IconPrompt } from "@/components/icons";
import { PromptEditor } from "@/components/prompts/editor";
import { listAssets } from "@/lib/media/assets";
import { loadAll } from "@/lib/load";
import { getPrompt, listPrompts } from "@/lib/prompts/store";
import { emptyPrompt } from "@/lib/prompts/types";

export async function generateMetadata({ params }: PageProps<"/prompts/[id]">) {
  const { id } = await params;
  return { title: id === "new" ? "New prompt" : (await getPrompt(id))?.title || "Prompt" };
}

export default async function PromptPage({ params }: PageProps<"/prompts/[id]">) {
  const { id } = await params;
  const { collabs } = await loadAll();
  const entry = id === "new" ? emptyPrompt() : await getPrompt(id);
  if (!entry) notFound();
  const knownModels = [...new Set((await listPrompts()).map((p) => p.model).filter(Boolean))];
  return (
    <div className="tool-page" data-tool="prompts">
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/prompts">Prompts</Link><span>/</span><b>{entry.id ? entry.title : "New prompt"}</b></div>
      <div className="tool-cover short" aria-hidden />
      <div className="page">
        <div className="page-ico tool-ico"><IconPrompt /></div>
        <PromptEditor key={entry.updatedAt || "new"} initial={entry} initialAssets={await listAssets(entry.assetIds)} collabs={collabs} knownModels={knownModels} />
      </div>
    </div>
  );
}
