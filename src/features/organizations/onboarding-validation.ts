export const ONBOARDING_TONES = ["cercano", "profesional", "directo", "empatico"] as const;
export const ONBOARDING_GOALS = [
  "agendar_mas_citas", "captar_clientes", "mejorar_seguimiento", "organizar_operacion",
] as const;

export type OnboardingStep = 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function isOnboardingStep(value: number): value is OnboardingStep {
  return Number.isInteger(value) && value >= 3 && value <= 9;
}

export function validateOnboardingValue(step: OnboardingStep, form: FormData):
  | { ok: true; value: string | null }
  | { ok: false; value: string; message: string } {
  const entries = form.getAll("value");
  const raw = entries.length === 1 && typeof entries[0] === "string" ? entries[0] : null;
  const value = (raw ?? "").trim();
  const safeValue = value.slice(0, 500);

  if (step === 4 || step === 5) {
    if (entries.length === 0) return { ok: true, value: null };
    return { ok: false, value: "", message: "Vuelve a intentarlo desde este paso." };
  }
  if (raw === null) return {
    ok: false, value: "", message: "Revisa este campo y vuelve a intentarlo.",
  };

  if (step === 3 && (value.length < 1 || value.length > 120)) return {
    ok: false, value: safeValue, message: "Escribe una ciudad de hasta 120 caracteres.",
  };
  if (step === 6 && (value.length < 1 || value.length > 500)) return {
    ok: false, value: safeValue, message: "Describe a tu cliente ideal en hasta 500 caracteres.",
  };
  if (step === 7 && value && (
    value.length > 32 || !/^\+?[0-9 ()-]{7,32}$/.test(value)
    || (value.match(/\d/g) ?? []).length < 7
  )) return {
    ok: false, value: safeValue, message: "Escribe un número de WhatsApp válido o déjalo vacío.",
  };
  if (step === 8 && !ONBOARDING_TONES.includes(value as (typeof ONBOARDING_TONES)[number])) return {
    ok: false, value: "", message: "Elige un tono de comunicación.",
  };
  if (step === 9 && !ONBOARDING_GOALS.includes(value as (typeof ONBOARDING_GOALS)[number])) return {
    ok: false, value: "", message: "Elige tu objetivo principal.",
  };
  return { ok: true, value: value || null };
}
