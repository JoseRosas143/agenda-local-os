import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions, getSupabaseEnv } from "./env";

export async function createClient(
  { readOnly = true }: { readOnly?: boolean } = {},
) {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(15_000),
      }),
    },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        const write = () => cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
        if (!readOnly) {
          // Actions must NOT hide a failure to persist login/logout cookies.
          write();
          return;
        }
        try { write(); }
        catch {
          // Server Components cannot write cookies. Proxy refreshes cookies AND
          // cache headers; actions use readOnly:false and propagate failures.
        }
      },
    },
  });
}
