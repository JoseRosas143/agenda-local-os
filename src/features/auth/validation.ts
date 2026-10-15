// Pure validation. No secrets, network requests, React or server imports.
export type CredentialFields = Partial<
  Record<"email" | "password" | "confirmPassword", string>
>;
export type CredentialsResult =
  | { ok: true; email: string; password: string }
  | { ok: false; fieldErrors: CredentialFields };

export function readSingleText(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    && Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    });
}

export function validateCredentials(
  form: FormData,
  mode: "login" | "register",
): CredentialsResult {
  const email = readSingleText(form, "email")?.trim().toLowerCase() ?? "";
  // Never trim or return passwords in an action's public result.
  const password = readSingleText(form, "password");
  const fields: CredentialFields = {};
  if (!validEmail(email)) fields.email = "Escribe un correo electrónico válido.";
  const minimum = mode === "register" ? 12 : 1;
  if (password === null || password.length < minimum || password.length > 128) {
    fields.password = mode === "register"
      ? "Utiliza entre 12 y 128 caracteres. Puedes usar una frase larga."
      : "Escribe tu contraseña (máximo 128 caracteres).";
  }
  if (mode === "register" && readSingleText(form, "confirmPassword") !== password) {
    fields.confirmPassword = "Las contraseñas no coinciden.";
  }
  if (Object.keys(fields).length > 0 || password === null) {
    return { ok: false, fieldErrors: fields };
  }
  return { ok: true, email, password };
}

export function validConfirmation(token: unknown, type: unknown): token is string {
  return type === "email" && typeof token === "string"
    && /^[a-zA-Z0-9_-]{16,512}$/.test(token);
}

export function parseAppOrigin(raw: string | undefined): string {
  if (!raw) throw new Error("Falta APP_URL en el entorno del servidor.");
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error("APP_URL no es una URL válida."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL debe ser un origen HTTPS, o HTTP solo en localhost, sin ruta ni credenciales.");
  }
  return url.origin;
}

export function publicAuthError(error: unknown): string {
  const obj = typeof error === "object" && error !== null ? error : {};
  const code = "code" in obj && typeof obj.code === "string" ? obj.code : "";
  const status = "status" in obj && typeof obj.status === "number" ? obj.status : 0;
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "Hay demasiados intentos. Espera antes de volver a intentarlo.";
  }
  if (code === "email_not_confirmed") {
    return "Confirma tu correo antes de entrar. Puedes solicitar otro mensaje en Confirmar mi correo.";
  }
  if (code === "email_address_not_authorized") {
    return "El servicio de correo no permite enviar a esta dirección de prueba. Revisa la configuración SMTP del proyecto.";
  }
  if (code === "weak_password") {
    return "La contraseña no cumple los requisitos del proyecto. Elige una frase más larga y diferente.";
  }
  if (code === "invalid_credentials") {
    return "No se pudo iniciar sesión. Revisa el correo y la contraseña.";
  }
  return "No se pudo completar la solicitud. Inténtalo de nuevo más tarde.";
}
