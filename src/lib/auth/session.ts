import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Request/render-pass cache only, not an application-wide cache of user data.
export const getVerifiedUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === "AuthSessionMissingError"
        || error.status === 400 || error.status === 401 || error.status === 403) {
      return null;
    }
    // Fail closed on network/service/configuration errors; never return a user.
    throw new Error("No se pudo validar la sesión con el servicio de autenticación.");
  }
  const user = data.user;
  if (!user || user.is_anonymous || !user.email_confirmed_at) return null;
  // Return only this screen's fields, never access/refresh tokens or metadata.
  return { id: user.id, email: user.email ?? "" };
});

export async function requireUser() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login");
  return user;
}
