"use client";

import { useActionState, useState } from "react";
import { createOrganizationAction } from "@/features/organizations/actions";
import { INITIAL_CREATE_ORGANIZATION_STATE } from "@/features/organizations/types";
import { CURRENCIES, INDUSTRIES, TIMEZONES, suggestSlug, type Industry } from "@/features/organizations/validation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

const INDUSTRY_LABELS: Record<Industry, string> = {
  general: "General", dental: "Dental", medical: "Médico",
};
const TIMEZONE_LABELS: Record<(typeof TIMEZONES)[number], string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Cancun": "Cancún",
  "America/Hermosillo": "Hermosillo",
  "America/Tijuana": "Tijuana",
  "America/Bogota": "Bogotá",
  "America/Lima": "Lima",
  "America/New_York": "Nueva York",
};

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(
    createOrganizationAction, INITIAL_CREATE_ORGANIZATION_STATE,
  );
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values?.slug));
  const [industry, setIndustry] = useState<Industry>(state.values?.industry ?? "general");
  const [timezone, setTimezone] = useState<(typeof TIMEZONES)[number]>(
    state.values?.timezone ?? "America/Mexico_City",
  );
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(
    state.values?.currency ?? "MXN",
  );

  return (
    <form action={action} aria-busy={pending} className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6">
        {state.message ? (
          <Alert variant="destructive" role="status" aria-live="polite">
            <AlertTitle>Revisa tu solicitud</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <Field data-invalid={Boolean(state.fieldErrors?.name)}>
          <FieldLabel htmlFor="organization-name">Nombre del negocio</FieldLabel>
          <Input id="organization-name" name="name" value={name} maxLength={160} required
            autoComplete="organization" placeholder="Ej. Clínica Sonrisa"
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              if (!slugEdited) setSlug(suggestSlug(nextName));
            }}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? "organization-name-error" : undefined}
          />
          {state.fieldErrors?.name ? <FieldError id="organization-name-error">{state.fieldErrors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={Boolean(state.fieldErrors?.slug)}>
          <FieldLabel htmlFor="organization-slug">Identificador</FieldLabel>
          <Input id="organization-slug" name="slug" value={slug} maxLength={63} required
            minLength={3} autoCapitalize="none" spellCheck={false} inputMode="url"
            placeholder="Ej. clinica-sonrisa"
            onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }}
            aria-invalid={Boolean(state.fieldErrors?.slug)}
            aria-describedby={state.fieldErrors?.slug ? "organization-slug-error organization-slug-help" : "organization-slug-help"}
          />
          <FieldDescription id="organization-slug-help">
            Se usará como identificador interno de tu negocio.
          </FieldDescription>
          {state.fieldErrors?.slug ? <FieldError id="organization-slug-error">{state.fieldErrors.slug}</FieldError> : null}
        </Field>

        <fieldset className="flex flex-col gap-3" aria-describedby={state.fieldErrors?.industry ? "industry-error" : undefined}>
          <legend className="text-sm font-medium">Tipo de negocio</legend>
          <div className="grid grid-cols-3 rounded-lg border bg-background p-1">
            {INDUSTRIES.map((option) => (
              <label key={option} className="cursor-pointer">
                <input type="radio" name="industry" value={option} checked={industry === option}
                  onChange={() => setIndustry(option)} className="peer sr-only" />
                <span className="flex min-h-10 items-center justify-center rounded-md px-1 text-sm text-muted-foreground transition-colors peer-checked:bg-muted peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                  {INDUSTRY_LABELS[option]}
                </span>
              </label>
            ))}
          </div>
          {industry !== "general" ? (
            <p className="text-sm text-muted-foreground">Seleccionar este tipo no habilita expedientes ni permisos clínicos.</p>
          ) : null}
          {state.fieldErrors?.industry ? <FieldError id="industry-error">{state.fieldErrors.industry}</FieldError> : null}
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={Boolean(state.fieldErrors?.timezone)}>
            <FieldLabel htmlFor="organization-timezone">Zona horaria</FieldLabel>
            <select id="organization-timezone" name="timezone" value={timezone}
              onChange={(event) => setTimezone(event.target.value as (typeof TIMEZONES)[number])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
              aria-invalid={Boolean(state.fieldErrors?.timezone)}>
              {TIMEZONES.map((option) => <option key={option} value={option}>{TIMEZONE_LABELS[option]}</option>)}
            </select>
            {state.fieldErrors?.timezone ? <FieldError>{state.fieldErrors.timezone}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(state.fieldErrors?.currency)}>
            <FieldLabel htmlFor="organization-currency">Moneda</FieldLabel>
            <select id="organization-currency" name="currency" value={currency}
              onChange={(event) => setCurrency(event.target.value as (typeof CURRENCIES)[number])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
              aria-invalid={Boolean(state.fieldErrors?.currency)}>
              {CURRENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {state.fieldErrors?.currency ? <FieldError>{state.fieldErrors.currency}</FieldError> : null}
          </Field>
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
          {pending ? "Creando negocio…" : "Crear y continuar"}
        </Button>
      </div>
    </form>
  );
}
