"use client";

import { useActionState } from "react";
import { signInAction, signUpAction, resendConfirmationAction } from "../../features/auth/actions";
import { INITIAL_AUTH_STATE } from "../../features/auth/types";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";

export function AuthForm({ mode }: { mode: "login" | "register" | "resend" }) {
  const action = mode === "login" ? signInAction
    : mode === "register" ? signUpAction : resendConfirmationAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_AUTH_STATE);
  const registration = mode === "register";
  const label = mode === "login" ? "Iniciar sesión" : registration ? "Crear cuenta" : "Enviar confirmación";
  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
      {state.message ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"} role="status" aria-live="polite">
          <AlertTitle>{state.status === "error" ? "Revisa tu solicitud" : "Solicitud recibida"}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.email)}>
          <FieldLabel htmlFor={`${mode}-email`}>Correo electrónico</FieldLabel>
          <Input id={`${mode}-email`} name="email" type="email" autoComplete="email"
            required maxLength={254} autoCapitalize="none" spellCheck={false}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? `${mode}-email-error` : undefined} />
          {state.fieldErrors?.email ? <FieldError id={`${mode}-email-error`}>{state.fieldErrors.email}</FieldError> : null}
        </Field>
        {mode !== "resend" ? (
          <Field data-invalid={Boolean(state.fieldErrors?.password)}>
            <FieldLabel htmlFor={`${mode}-password`}>Contraseña</FieldLabel>
            <Input id={`${mode}-password`} name="password" type="password" required
              autoComplete={registration ? "new-password" : "current-password"}
              minLength={registration ? 12 : 1} maxLength={128}
              aria-invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={state.fieldErrors?.password ? `${mode}-password-error` : registration ? "password-help" : undefined} />
            {registration ? <FieldDescription id="password-help">Entre 12 y 128 caracteres. Una frase larga es más fácil de recordar.</FieldDescription> : null}
            {state.fieldErrors?.password ? <FieldError id={`${mode}-password-error`}>{state.fieldErrors.password}</FieldError> : null}
          </Field>
        ) : null}
        {registration ? (
          <Field data-invalid={Boolean(state.fieldErrors?.confirmPassword)}>
            <FieldLabel htmlFor="register-confirm">Repite tu contraseña</FieldLabel>
            <Input id="register-confirm" name="confirmPassword" type="password" required
              autoComplete="new-password" minLength={12} maxLength={128}
              aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
              aria-describedby={state.fieldErrors?.confirmPassword ? "register-confirm-error" : undefined} />
            {state.fieldErrors?.confirmPassword ? <FieldError id="register-confirm-error">{state.fieldErrors.confirmPassword}</FieldError> : null}
          </Field>
        ) : null}
        <Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {pending ? "Procesando…" : label}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
