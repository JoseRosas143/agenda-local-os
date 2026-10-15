"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/features/crm/context";
import { createClient } from "@/lib/supabase/server";
import { isOnboardingStep, validateOnboardingValue, type OnboardingStep } from "./onboarding-validation";
import type { OnboardingFormState } from "./onboarding-types";

export async function saveOnboardingStepAction(
  organizationId: string,
  step: OnboardingStep,
  _previous: OnboardingFormState,
  form: FormData,
): Promise<OnboardingFormState> {
  const { canManage } = await getBusinessContext(organizationId);
  if (!canManage || !isOnboardingStep(step)) {
    return { message: "No tienes permiso para configurar este negocio." };
  }
  const input = validateOnboardingValue(step, form);
  if (!input.ok) return { message: input.message, value: input.value };

  try {
    const supabase = await createClient({ readOnly: false });
    const { data, error } = await supabase.rpc("save_business_onboarding_step", {
      p_organization_id: organizationId,
      p_step: step,
      p_value: input.value,
    });
    if (error || typeof data !== "number" || data < step || data > 9) return {
      message: error?.code === "42501"
        ? "Tu acceso a este negocio cambió. Actualiza la página."
        : "No pudimos guardar este paso. Actualiza la página y vuelve a intentarlo.",
      value: input.value ?? "",
    };
  } catch {
    return {
      message: "No pudimos confirmar el guardado. Revisa el progreso antes de intentarlo otra vez.",
      value: input.value ?? "",
    };
  }

  const base = `/business/${organizationId}`;
  revalidatePath("/account");
  revalidatePath(base);
  revalidatePath(`${base}/setup`);
  redirect(step === 9 ? `${base}/setup?done=1` : `${base}/setup?step=${step + 1}`);
}
