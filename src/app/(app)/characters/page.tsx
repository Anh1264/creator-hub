import { CharacterAlbum } from "@/components/characters/gallery";
import { listAssets } from "@/lib/launch/assets";
import { listAlbum } from "@/lib/launch/store";
import { loadAll } from "@/lib/load";

export const metadata = { title: "Characters" };

export default async function CharactersPage() {
  await loadAll(); // auth
  const pics = listAssets(listAlbum().map((e) => e.assetId));
  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Characters</b></div>
      <div className="page no-cover">
        <h1 className="title">Characters</h1>
        <p className="lede">Your character images in one album. Click one to view it full size, copy it straight into an AI tool, or download it.</p>
        <CharacterAlbum initial={pics} />
      </div>
    </>
  );
}
