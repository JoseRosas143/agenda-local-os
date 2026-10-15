export const INDUSTRIES = ["general", "dental", "medical"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const TIMEZONES = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Hermosillo",
  "America/Tijuana",
  "America/Bogota",
  "America/Lima",
  "America/New_York",
] as const;

export const CURRENCIES = ["MXN", "USD", "COP", "PEN"] as const;

export type OrganizationInput = {
  name: string;
  slug: string;
  industry: Industry;
  timezone: (typeof TIMEZONES)[number];
  currency: (typeof CURRENCIES)[number];
};

export type OrganizationField = keyof OrganizationInput;
export type OrganizationFieldErrors = Partial<Record<OrganizationField, string>>;

function singleText(form: FormData, field: OrganizationField): string | null {
  const values = form.getAll(field);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export function suggestSlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63)
    .replace(/-$/g, "");
}

export function validateOrganization(form: FormData):
  | { ok: true; value: OrganizationInput }
  | { ok: false; fieldErrors: OrganizationFieldErrors; values: Partial<OrganizationInput> } {
  const name = singleText(form, "name")?.trim() ?? "";
  const slug = singleText(form, "slug")?.trim() ?? "";
  const industry = singleText(form, "industry") ?? "";
  const timezone = singleText(form, "timezone") ?? "";
  const currency = singleText(form, "currency") ?? "";
  const fieldErrors: OrganizationFieldErrors = {};

  if (name.length < 1 || name.length > 160) {
    fieldErrors.name = "Escribe un nombre de 1 a 160 caracteres.";
  }
  if (slug.length < 3 || slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fieldErrors.slug = "Usa entre 3 y 63 letras minúsculas, números o guiones internos.";
  }
  if (!INDUSTRIES.includes(industry as Industry)) {
    fieldErrors.industry = "Elige un tipo de negocio.";
  }
  if (!TIMEZONES.includes(timezone as OrganizationInput["timezone"])) {
    fieldErrors.timezone = "Elige una zona horaria de la lista.";
  }
  if (!CURRENCIES.includes(currency as OrganizationInput["currency"])) {
    fieldErrors.currency = "Elige una moneda de la lista.";
  }

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      fieldErrors,
      values: {
        name: name.slice(0, 160), slug: slug.slice(0, 63),
        industry: INDUSTRIES.includes(industry as Industry) ? industry as Industry : undefined,
        timezone: TIMEZONES.includes(timezone as OrganizationInput["timezone"])
          ? timezone as OrganizationInput["timezone"] : undefined,
        currency: CURRENCIES.includes(currency as OrganizationInput["currency"])
          ? currency as OrganizationInput["currency"] : undefined,
      },
    };
  }
  return { ok: true, value: {
    name, slug, industry: industry as Industry,
    timezone: timezone as OrganizationInput["timezone"],
    currency: currency as OrganizationInput["currency"],
  } };
}
