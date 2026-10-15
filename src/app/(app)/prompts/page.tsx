import { PromptLibrary } from "@/components/prompts/library";
import { IconPrompt } from "@/components/icons";
import { listAssets } from "@/lib/media/assets";
import { loadAll } from "@/lib/load";
import { listPrompts } from "@/lib/prompts/store";

export const metadata = { title: "Prompts" };

export default async function PromptsPage() {
  const { collabs } = await loadAll();
  const prompts = await listPrompts();
  const all = new Map((await listAssets(prompts.flatMap((p) => p.assetIds))).map((a) => [a.id, a]));
  const covers = Object.fromEntries(prompts.map((p) => {
    const media = p.assetIds.map((id) => all.get(id)).filter((a) => !!a);
    return [p.id, media.find((a) => a.kind === "image") ?? media[0]];
  }));
  return (
    <div className="tool-page" data-tool="prompts">
      <div className="crumbs"><span>Hub</span><span>/</span><b>Prompts</b></div>
      <div className="tool-cover" aria-hidden />
      <div className="page">
        <div className="page-ico tool-ico"><IconPrompt /></div>
        <h1 className="title">Prompts</h1>
        <p className="lede">Every prompt you&apos;ve shipped, the model it ran on, and where the result went live.</p>
        <PromptLibrary prompts={prompts} covers={covers} collabNames={Object.fromEntries(collabs.map((c) => [c.id, c.name]))} />
      </div>
    </div>
  );
}
