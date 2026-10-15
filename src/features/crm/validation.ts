export type ContactValues = {
  displayName: string;
  email: string;
  phone: string;
  source: string;
  archived: boolean;
};

export type ServiceValues = {
  code: string;
  name: string;
  description: string;
  price: string;
  durationMinutes: string;
  active: boolean;
};

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

function singleText(form: FormData, field: string): string | null {
  const values = form.getAll(field);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function optionalText(form: FormData, field: string): string | null {
  const values = form.getAll(field);
  if (values.length === 0) return "";
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function checkbox(form: FormData, field: string): boolean | null {
  const values = form.getAll(field);
  if (values.length === 0) return false;
  return values.length === 1 && values[0] === "on" ? true : null;
}

export const CONTACT_SOURCES = ["manual", "referral", "website", "other"] as const;

export function validateContact(form: FormData):
  | { ok: true; value: ContactValues }
  | { ok: false; values: ContactValues; fieldErrors: FieldErrors<ContactValues> } {
  const displayName = (singleText(form, "displayName") ?? "").trim();
  const emailRaw = optionalText(form, "email");
  const phoneRaw = optionalText(form, "phone");
  const sourceRaw = optionalText(form, "source");
  const email = (emailRaw ?? "").trim().toLowerCase();
  const phone = (phoneRaw ?? "").trim();
  const source = sourceRaw ?? "";
  const archived = checkbox(form, "archived");
  const values: ContactValues = {
    displayName: displayName.slice(0, 160), email: email.slice(0, 254),
    phone: phone.slice(0, 32), source: source.slice(0, 32), archived: archived ?? false,
  };
  const fieldErrors: FieldErrors<ContactValues> = {};
  if (!displayName || displayName.length > 160) fieldErrors.displayName = "Escribe un nombre de 1 a 160 caracteres.";
  if (emailRaw === null || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    fieldErrors.email = "Escribe un correo válido de hasta 254 caracteres.";
  }
  if (phoneRaw === null || phone.length > 32 || (phone && !/^\+?[0-9 ()-]{7,32}$/.test(phone))) {
    fieldErrors.phone = "Usa de 7 a 32 caracteres: números, espacios, paréntesis o guiones.";
  }
  if (sourceRaw === null || (source && !CONTACT_SOURCES.includes(source as (typeof CONTACT_SOURCES)[number]))) {
    fieldErrors.source = "Elige un origen de la lista.";
  }
  if (archived === null) fieldErrors.archived = "Valor de archivo inválido.";
  if (Object.keys(fieldErrors).length) return { ok: false, values, fieldErrors };
  return { ok: true, value: values };
}

export function validateService(form: FormData):
  | { ok: true; value: ServiceValues }
  | { ok: false; values: ServiceValues; fieldErrors: FieldErrors<ServiceValues> } {
  const code = (singleText(form, "code") ?? "").trim().toLowerCase();
  const name = (singleText(form, "name") ?? "").trim();
  const descriptionRaw = optionalText(form, "description");
  const description = (descriptionRaw ?? "").trim();
  const price = (singleText(form, "price") ?? "").trim();
  const durationRaw = optionalText(form, "durationMinutes");
  const durationMinutes = (durationRaw ?? "").trim();
  const active = checkbox(form, "active");
  const values: ServiceValues = {
    code: code.slice(0, 80), name: name.slice(0, 160),
    description: description.slice(0, 1000), price: price.slice(0, 15),
    durationMinutes: durationMinutes.slice(0, 4), active: active ?? false,
  };
  const fieldErrors: FieldErrors<ServiceValues> = {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || code.length > 80) {
    fieldErrors.code = "Usa hasta 80 letras minúsculas, números o guiones internos.";
  }
  if (!name || name.length > 160) fieldErrors.name = "Escribe un nombre de 1 a 160 caracteres.";
  if (descriptionRaw === null || description.length > 1000) fieldErrors.description = "Usa hasta 1000 caracteres.";
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(price)) {
    fieldErrors.price = "Indica un importe no negativo con máximo dos decimales.";
  }
  if (durationRaw === null || (durationMinutes && (!/^[1-9]\d{0,3}$/.test(durationMinutes) || Number(durationMinutes) > 1440))) {
    fieldErrors.durationMinutes = "Indica entre 1 y 1440 minutos, o déjalo vacío.";
  }
  if (active === null) fieldErrors.active = "Valor de disponibilidad inválido.";
  if (Object.keys(fieldErrors).length) return { ok: false, values, fieldErrors };
  return { ok: true, value: values };
}
