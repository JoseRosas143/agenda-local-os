import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, getSupabaseEnv } from "./env";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(15_000),
      }),
    },
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({ request });
        previousCookies.forEach((cookie) => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(cacheHeaders ?? {}).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
  // Call immediately after construction; never trust getSession() for access.
  const { data, error } = await supabase.auth.getClaims();
  const hasIdentity = !error && typeof data?.claims?.sub === "string"
    && data.claims.is_anonymous !== true;
  const account = request.nextUrl.pathname === "/account"
    || request.nextUrl.pathname.startsWith("/account/");

  // Early redirect only for navigation. Actions/API routes have their own guards.
  if (account && ["GET", "HEAD"].includes(request.method) && !hasIdentity) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return noStore(redirect);
  }
  return noStore(response);
}
