"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateOrganization } from "./validation";
import type { CreateOrganizationState } from "./types";

export async function createOrganizationAction(
  _previous: CreateOrganizationState, form: FormData,
): Promise<CreateOrganizationState> {
  await requireUser();
  const input = validateOrganization(form);
  if (!input.ok) return {
    status: "error", fieldErrors: input.fieldErrors, values: input.values,
  };

  try {
    const supabase = await createClient({ readOnly: false });
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: input.value.name,
      p_slug: input.value.slug,
      p_industry: input.value.industry,
      p_timezone: input.value.timezone,
      p_currency: input.value.currency,
    });
    if (error) {
      if (error.code === "23505") return {
        status: "error", values: input.value,
        fieldErrors: { slug: "Este identificador ya está en uso. Prueba otro." },
      };
      return {
        status: "error", values: input.value,
        message: "No pudimos crear el negocio. Comprueba tu conexión y vuelve a intentarlo.",
      };
    }
    if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) {
      return {
        status: "error", values: input.value,
        message: "No pudimos confirmar la creación. Revisa tu cuenta antes de intentarlo de nuevo.",
      };
    }
  } catch {
    return {
      status: "error", values: input.value,
      message: "No pudimos confirmar la creación. Revisa tu cuenta antes de intentarlo de nuevo.",
    };
  }

  revalidatePath("/account");
  redirect("/account?created=1");
}
