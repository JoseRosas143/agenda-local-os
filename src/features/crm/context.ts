import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean { return UUID.test(value); }

export const getBusinessContext = cache(async (organizationId: string) => {
  if (!isUuid(organizationId)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const [organizationResult, memberResult] = await Promise.all([
    supabase.from("organizations").select("id,name,slug,currency,industry")
      .eq("id", organizationId).maybeSingle(),
    supabase.from("organization_members").select("role,status")
      .eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (organizationResult.error || memberResult.error) {
    throw new Error("No pudimos cargar el negocio.");
  }
  const organization = organizationResult.data;
  const membership = memberResult.data;
  if (!organization || !membership || membership.status !== "active") notFound();
  return { organization, canManage: membership.role === "owner" || membership.role === "admin" };
});
