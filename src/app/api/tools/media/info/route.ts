import { fail, guard } from "@/lib/tools/http";
import { lookup, parseUrl } from "@/lib/tools/media";
import { BROWSERS, type Browser } from "@/lib/tools/shared";

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const cookies = BROWSERS.includes(body.cookies) ? (body.cookies as Browser) : null;
    return Response.json(await lookup(parseUrl(body.url), cookies));
  } catch (e) {
    return fail(e);
  }
}
