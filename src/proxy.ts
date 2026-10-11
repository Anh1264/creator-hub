// Runs before every page request: refreshes the Supabase session cookie and
// sends signed-out visitors to /login. (Next.js 16 renamed middleware → proxy.)
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { IS_DEMO, SUPABASE_KEY, SUPABASE_URL, isAllowedEmail } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  if (IS_DEMO) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() verifies the JWT — don't put code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  const signedIn = !!data?.claims && isAllowedEmail(email);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

// API routes are left out: each one checks sign-in itself (guard() / isSignedIn()), and running the
// proxy in front of them makes Next.js buffer the request body and cut it off at 10 MB, which
// silently truncated big uploads (Launchpad media, Transcribe files, the compressors).
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
