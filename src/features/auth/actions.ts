"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "./types";
import {
  parseAppOrigin, publicAuthError, readSingleText, validConfirmation,
  validEmail, validateCredentials,
} from "./validation";

function goToAccount(): never {
  revalidatePath("/", "layout");
  redirect("/account");
}
function failure(error: unknown): AuthActionState {
  return { status: "error", message: publicAuthError(error) };
}

export async function signInAction(
  _previous: AuthActionState, form: FormData,
): Promise<AuthActionState> {
  const input = validateCredentials(form, "login");
  if (!input.ok) return { status: "error", fieldErrors: input.fieldErrors };
  try {
    const supabase = await createClient({ readOnly: false });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email, password: input.password,
    });
    if (error) return failure(error);
    if (!data.session || !data.user || data.user.is_anonymous) return failure(null);
  } catch { return failure(null); }
  // redirect throws intentionally; keep it OUTSIDE catch.
  goToAccount();
}

export async function signUpAction(
  _previous: AuthActionState, form: FormData,
): Promise<AuthActionState> {
  const input = validateCredentials(form, "register");
  if (!input.ok) return { status: "error", fieldErrors: input.fieldErrors };
  let hasSession = false;
  try {
    const origin = parseAppOrigin(process.env.APP_URL);
    const supabase = await createClient({ readOnly: false });
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
      // No user-controlled roles, organization, or permissions in metadata.
    });
    if (error) {
      if (error.code !== "user_already_exists") return failure(error);
    } else {
      hasSession = Boolean(data.session);
    }
  } catch { return failure(null); }
  // Supports the provider response but do not disable confirmation to bypass QA.
  if (hasSession) goToAccount();
  redirect("/auth/check-email");
}

export async function resendConfirmationAction(
  _previous: AuthActionState, form: FormData,
): Promise<AuthActionState> {
  const email = readSingleText(form, "email")?.trim().toLowerCase() ?? "";
  if (!validEmail(email)) return {
    status: "error", fieldErrors: { email: "Escribe un correo electrónico válido." },
  };
  try {
    const origin = parseAppOrigin(process.env.APP_URL);
    const supabase = await createClient({ readOnly: false });
    const { error } = await supabase.auth.resend({
      type: "signup", email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error && !["user_not_found", "email_not_found", "email_already_confirmed"].includes(error.code ?? "")) {
      return failure(error);
    }
  } catch { return failure(null); }
  return { status: "success", message: "Si hay una cuenta pendiente para ese correo, recibirás un enlace de confirmación. Revisa también spam." };
}

export async function confirmSignupAction(
  _previous: AuthActionState, form: FormData,
): Promise<AuthActionState> {
  const token = readSingleText(form, "token_hash");
  const type = readSingleText(form, "type");
  const invalid: AuthActionState = {
    status: "error",
    message: "El enlace no es válido o ya venció. Si tu correo ya está confirmado, inicia sesión; de lo contrario solicita otro mensaje.",
  };
  if (!validConfirmation(token, type)) return invalid;
  try {
    const supabase = await createClient({ readOnly: false });
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token, type: "email",
    });
    if (error) return error.status === 429 ? failure(error) : invalid;
    if (!data.session || !data.user || data.user.is_anonymous) return invalid;
  } catch { return failure(null); }
  goToAccount();
}

export async function signOutAction(
   _previous: AuthActionState,   _form: FormData,
): Promise<AuthActionState> {
  void _previous; void _form;
  try {
    const supabase = await createClient({ readOnly: false });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return failure(error);
  } catch { return failure(null); }
  revalidatePath("/", "layout");
  redirect("/login?status=signed-out");
}
