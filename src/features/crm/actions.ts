"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext, isUuid } from "./context";
import type { ContactFormState, ServiceFormState } from "./types";
import { validateContact, validateService } from "./validation";

function basePath(organizationId: string) { return `/business/${organizationId}`; }

export async function saveContactAction(
  organizationId: string, contactId: string | null, _previous: ContactFormState, form: FormData,
): Promise<ContactFormState> {
  const { canManage } = await getBusinessContext(organizationId);
  if (!canManage || (contactId !== null && !isUuid(contactId))) {
    return { message: "No tienes permiso para guardar este contacto." };
  }
  const input = validateContact(form);
  if (!input.ok) return {
    message: "Revisa los campos marcados.", fieldErrors: input.fieldErrors, values: input.values,
  };
  const { displayName, email, phone, source, archived } = input.value;
  try {
    const supabase = await createClient({ readOnly: false });
    const payload = {
      display_name: displayName, email: email || null, phone: phone || null,
      source: source || null,
    };
    const result = contactId === null
      ? await supabase.from("contacts").insert({ organization_id: organizationId, ...payload }).select("id").single()
      : await supabase.from("contacts").update({
        ...payload, archived_at: archived ? new Date().toISOString() : null,
      }).eq("organization_id", organizationId).eq("id", contactId).select("id").single();
    if (result.error || !result.data) return {
      message: "No pudimos confirmar el guardado. Revisa la lista antes de intentarlo otra vez.",
      values: input.value,
    };
  } catch {
    return { message: "No pudimos confirmar el guardado. Revisa la lista antes de intentarlo otra vez.", values: input.value };
  }
  revalidatePath(`${basePath(organizationId)}/contacts`);
  redirect(`${basePath(organizationId)}/contacts?${contactId ? "updated" : "created"}=1`);
}

export async function saveServiceAction(
  organizationId: string, serviceId: string | null, _previous: ServiceFormState, form: FormData,
): Promise<ServiceFormState> {
  const { canManage } = await getBusinessContext(organizationId);
  if (!canManage || (serviceId !== null && !isUuid(serviceId))) {
    return { message: "No tienes permiso para guardar este servicio." };
  }
  const input = validateService(form);
  if (!input.ok) return {
    message: "Revisa los campos marcados.", fieldErrors: input.fieldErrors, values: input.values,
  };
  const { code, name, description, price, durationMinutes, active } = input.value;
  try {
    const supabase = await createClient({ readOnly: false });
    const payload = {
      code, name, description: description || null, price,
      duration_minutes: durationMinutes ? Number(durationMinutes) : null, active,
    };
    const result = serviceId === null
      ? await supabase.from("services").insert({ organization_id: organizationId, ...payload }).select("id").single()
      : await supabase.from("services").update(payload)
        .eq("organization_id", organizationId).eq("id", serviceId).select("id").single();
    if (result.error?.code === "23505") return {
      message: "Ya existe un servicio con ese identificador.",
      fieldErrors: { code: "Prueba un identificador diferente." }, values: input.value,
    };
    if (result.error || !result.data) return {
      message: "No pudimos confirmar el guardado. Revisa la lista antes de intentarlo otra vez.",
      values: input.value,
    };
  } catch {
    return { message: "No pudimos confirmar el guardado. Revisa la lista antes de intentarlo otra vez.", values: input.value };
  }
  revalidatePath(`${basePath(organizationId)}/services`);
  const returnStep = form.getAll("returnStep");
  if (returnStep.length === 1 && (returnStep[0] === "4" || returnStep[0] === "5")) {
    revalidatePath(`${basePath(organizationId)}/setup`);
    redirect(`${basePath(organizationId)}/setup?step=${returnStep[0]}`);
  }
  redirect(`${basePath(organizationId)}/services?${serviceId ? "updated" : "created"}=1`);
}
