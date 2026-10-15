import "server-only";
import { listAlbum, listItems } from "../launch/store";
import { listPrompts } from "../prompts/store";
import { sweepOrphans } from "./assets";

/** Deletes uploads older than a day that no post, prompt or album entry uses. Never throws. */
export async function housekeeping() {
  try {
    const [items, album, prompts] = await Promise.all([listItems(), listAlbum(), listPrompts()]);
    await sweepOrphans(new Set([...items.flatMap((i) => i.assetIds), ...album.map((e) => e.assetId), ...prompts.flatMap((p) => p.assetIds)]));
  } catch (e) {
    console.warn("[housekeeping]", (e as Error).message);
  }
}
