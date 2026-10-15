"use client";

import { useActionState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { saveServiceAction } from "@/features/crm/actions";
import type { ServiceFormState } from "@/features/crm/types";
import type { ServiceValues } from "@/features/crm/validation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

export function ServiceForm({ organizationId, serviceId, currency, initial }: {
  organizationId: string; serviceId: string | null; currency: string; initial?: ServiceValues;
}) {
  const [state, action, pending] = useActionState(
    saveServiceAction.bind(null, organizationId, serviceId), {} as ServiceFormState,
  );
  const values = state.values ?? initial;
  const closeHref = `/business/${organizationId}/services`;
  return (
    <aside className="border-t bg-background lg:fixed lg:top-[76px] lg:right-0 lg:bottom-0 lg:z-10 lg:w-[464px] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label={serviceId ? "Editar servicio" : "Nuevo servicio"}>
      <form action={action} aria-busy={pending} className="flex h-full flex-col gap-5 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{serviceId ? "Editar servicio" : "Nuevo servicio"}</h2>
          <Link href={closeHref} aria-label="Cerrar formulario" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-5" /></Link>
        </div>
        {state.message ? <Alert variant="destructive" role="status"><AlertDescription>{state.message}</AlertDescription></Alert> : null}
        <div className="grid gap-1.5">
          <label htmlFor="service-name" className="text-sm font-medium">Nombre</label>
          <Input id="service-name" name="name" required maxLength={160} placeholder="Ej. Consulta inicial" defaultValue={values?.name ?? ""} aria-invalid={Boolean(state.fieldErrors?.name)} />
          {state.fieldErrors?.name ? <p className="text-sm text-destructive">{state.fieldErrors.name}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="service-code" className="text-sm font-medium">Identificador</label>
          <Input id="service-code" name="code" required maxLength={80} autoCapitalize="none" spellCheck={false} placeholder="Ej. consulta-inicial" defaultValue={values?.code ?? ""} aria-invalid={Boolean(state.fieldErrors?.code)} />
          {state.fieldErrors?.code ? <p className="text-sm text-destructive">{state.fieldErrors.code}</p> : <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guiones.</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="service-description" className="text-sm font-medium">Descripción</label>
          <textarea id="service-description" name="description" maxLength={1000} rows={3} defaultValue={values?.description ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          {state.fieldErrors?.description ? <p className="text-sm text-destructive">{state.fieldErrors.description}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="service-price" className="text-sm font-medium">Precio ({currency})</label>
            <Input id="service-price" name="price" required inputMode="decimal" placeholder="0.00" defaultValue={values?.price ?? "0.00"} aria-invalid={Boolean(state.fieldErrors?.price)} />
            {state.fieldErrors?.price ? <p className="text-sm text-destructive">{state.fieldErrors.price}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="service-duration" className="text-sm font-medium">Duración (min)</label>
            <Input id="service-duration" name="durationMinutes" type="number" min="1" max="1440" step="1" placeholder="Opcional" defaultValue={values?.durationMinutes ?? ""} aria-invalid={Boolean(state.fieldErrors?.durationMinutes)} />
            {state.fieldErrors?.durationMinutes ? <p className="text-sm text-destructive">{state.fieldErrors.durationMinutes}</p> : null}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="active" defaultChecked={values?.active ?? true} className="size-4 accent-foreground" />Servicio activo</label>
        <div className="mt-auto flex flex-wrap justify-between gap-3 border-t pt-5">
          <Link href={closeHref} className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Cancelar</Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {pending ? "Guardando…" : "Guardar servicio"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
