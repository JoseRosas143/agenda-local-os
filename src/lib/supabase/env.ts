import "server-only";

export function getSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key || !key.startsWith("sb_publishable_")) {
    throw new Error("Revisa la URL y la publishable key de Supabase en .env.local.");
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password
      || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Se requiere la URL HTTPS del proyecto Supabase, sin rutas ni credenciales.");
  }
  return { url: url.origin, key };
}

// The official SSR cookie pattern is kept compatible with a future browser client.
// Do not expose service-role/secret keys or create a global per-user client.
export function authCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
