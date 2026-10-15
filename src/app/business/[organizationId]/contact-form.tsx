"use client";

import { useActionState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { saveContactAction } from "@/features/crm/actions";
import type { ContactFormState } from "@/features/crm/types";
import type { ContactValues } from "@/features/crm/validation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

const SOURCE_LABELS = [
  ["", "Selecciona una opción"], ["manual", "Agregado manualmente"],
  ["referral", "Recomendación"], ["website", "Sitio web"], ["other", "Otro"],
] as const;

export function ContactForm({ organizationId, contactId, initial }: {
  organizationId: string; contactId: string | null; initial?: ContactValues;
}) {
  const [state, action, pending] = useActionState(
    saveContactAction.bind(null, organizationId, contactId), {} as ContactFormState,
  );
  const values = state.values ?? initial;
  const closeHref = `/business/${organizationId}/contacts`;
  return (
    <aside className="border-t bg-background lg:fixed lg:top-[76px] lg:right-0 lg:bottom-0 lg:z-10 lg:w-[464px] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label={contactId ? "Editar contacto" : "Nuevo contacto"}>
      <form action={action} aria-busy={pending} className="flex h-full flex-col gap-5 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{contactId ? "Editar contacto" : "Nuevo contacto"}</h2>
          <Link href={closeHref} aria-label="Cerrar formulario" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-5" /></Link>
        </div>
        {state.message ? <Alert variant="destructive" role="status"><AlertDescription>{state.message}</AlertDescription></Alert> : null}
        <div className="grid gap-1.5">
          <label htmlFor="contact-name" className="text-sm font-medium">Nombre</label>
          <Input id="contact-name" name="displayName" required maxLength={160} autoComplete="name" placeholder="Ej. Juan Pérez" defaultValue={values?.displayName ?? ""} aria-invalid={Boolean(state.fieldErrors?.displayName)} aria-describedby={state.fieldErrors?.displayName ? "contact-name-error" : undefined} />
          {state.fieldErrors?.displayName ? <p id="contact-name-error" className="text-sm text-destructive">{state.fieldErrors.displayName}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="contact-email" className="text-sm font-medium">Correo electrónico</label>
          <Input id="contact-email" name="email" type="email" maxLength={254} autoComplete="email" placeholder="Ej. juan@ejemplo.com" defaultValue={values?.email ?? ""} aria-invalid={Boolean(state.fieldErrors?.email)} aria-describedby={state.fieldErrors?.email ? "contact-email-error" : undefined} />
          {state.fieldErrors?.email ? <p id="contact-email-error" className="text-sm text-destructive">{state.fieldErrors.email}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="contact-phone" className="text-sm font-medium">Teléfono</label>
          <Input id="contact-phone" name="phone" type="tel" maxLength={32} autoComplete="tel" placeholder="Ej. +52 55 1234 5678" defaultValue={values?.phone ?? ""} aria-invalid={Boolean(state.fieldErrors?.phone)} aria-describedby={state.fieldErrors?.phone ? "contact-phone-error" : undefined} />
          {state.fieldErrors?.phone ? <p id="contact-phone-error" className="text-sm text-destructive">{state.fieldErrors.phone}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="contact-source" className="text-sm font-medium">Origen</label>
          <select id="contact-source" name="source" defaultValue={values?.source ?? ""} aria-invalid={Boolean(state.fieldErrors?.source)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            {SOURCE_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {state.fieldErrors?.source ? <p className="text-sm text-destructive">{state.fieldErrors.source}</p> : null}
        </div>
        {contactId ? <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="archived" defaultChecked={values?.archived ?? false} className="size-4 accent-foreground" />Archivar contacto</label> : null}
        <div className="mt-auto flex flex-wrap justify-between gap-3 border-t pt-5">
          <Link href={closeHref} className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Cancelar</Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {pending ? "Guardando…" : "Guardar contacto"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
