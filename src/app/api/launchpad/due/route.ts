import { isSignedIn } from "@/lib/auth";
import { APP_TIMEZONE } from "@/lib/env";
import { listItems } from "@/lib/launch/store";
import { PLATFORMS, PLATFORM_META, nowLocal } from "@/lib/launch/types";

/** Posts whose time has come and that aren't marked posted yet (for the sidebar badge + notifications). */
export async function GET() {
  if (!(await isSignedIn())) return Response.json({ error: "Signed out." }, { status: 401 });
  const now = nowLocal(APP_TIMEZONE);
  const due = listItems().filter((i) => i.ready).flatMap((i) =>
    PLATFORMS.filter((p) => {
      const pl = i.platforms[p];
      return pl.enabled && pl.status === "pending" && pl.scheduledAt && pl.scheduledAt <= now;
    }).map((p) => ({ id: i.id, title: i.title || "Untitled post", platform: PLATFORM_META[p].label, at: i.platforms[p].scheduledAt })));
  return Response.json({ now, due });
}
