import "server-only";
import { cache } from "react";
import { requireUser } from "./auth";
import { repo } from "./data";
import { today } from "./env";

/** One fetch per request, shared by the layout and the page (React cache dedupes). */
export const loadAll = cache(async () => {
  await requireUser();
  const [collabs, posts] = await Promise.all([repo.listCollabs(), repo.listPosts()]);
  return { collabs, posts, today: today() };
});
