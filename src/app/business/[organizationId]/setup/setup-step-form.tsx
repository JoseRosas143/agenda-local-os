"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { saveOnboardingStepAction } from "@/features/organizations/onboarding-actions";
import type { OnboardingFormState } from "@/features/organizations/onboarding-types";
import type { OnboardingStep } from "@/features/organizations/onboarding-validation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

const TITLES: Record<OnboardingStep, string> = {
  3: "¿En qué ciudad trabajas?",
  4: "¿Qué servicios ofreces?",
  5: "Revisa tus precios",
  6: "¿A quién quieres ayudar?",
  7: "Tu WhatsApp de negocio",
  8: "Elige cómo suena tu marca",
  9: "¿Cuál es tu objetivo principal?",
};

const TONES = [
  { value: "cercano", label: "Cercano", description: "Conversación amable y sencilla" },
  { value: "profesional", label: "Profesional", description: "Claro, serio y confiable" },
  { value: "directo", label: "Directo", description: "Breve y enfocado en la acción" },
  { value: "empatico", label: "Empático", description: "Atento y tranquilizador" },
];
const GOALS = [
  { value: "agendar_mas_citas", label: "Agendar más citas" },
  { value: "captar_clientes", label: "Conseguir más clientes" },
  { value: "mejorar_seguimiento", label: "Dar mejor seguimiento" },
  { value: "organizar_operacion", label: "Organizar mi operación" },
];

export function SetupStepForm({ organizationId, step, initial, currency, services }: {
  organizationId: string;
  step: OnboardingStep;
  initial: string;
  currency: string;
  services: { id: string; name: string; price: number }[];
}) {
  const [state, action, pending] = useActionState(
    saveOnboardingStepAction.bind(null, organizationId, step), {} as OnboardingFormState,
  );
  const base = `/business/${organizationId}`;
  const value = state.value ?? initial;
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency });
  const needsService = (step === 4 || step === 5) && services.length === 0;
  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{TITLES[step]}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step === 3 && "Esto nos ayuda a personalizar tu espacio. Puedes cambiarlo después."}
          {step === 4 && "Añade al menos un servicio activo. Tu catálogo siempre se puede editar."}
          {step === 5 && "Los precios se guardan en cada servicio, sin duplicarlos en tu perfil."}
          {step === 6 && "Piensa en la persona o empresa a la que más te gusta atender."}
          {step === 7 && "Opcional. Guardar tu número no enviará mensajes ni conectará WhatsApp."}
          {step === 8 && "Usaremos este tono más adelante al ayudarte a escribir mensajes."}
          {step === 9 && "Tu objetivo nos ayudará a ordenar los próximos pasos de la plataforma."}
        </p>
      </div>

      {state.message ? <Alert variant="destructive" role="status" aria-live="polite">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert> : null}

      {step === 3 ? <div className="space-y-2">
        <label htmlFor="setup-value" className="text-sm font-medium">Ciudad</label>
        <Input id="setup-value" name="value" defaultValue={value} maxLength={120} required
          autoComplete="address-level2" placeholder="Ej. Puebla" aria-invalid={Boolean(state.message)} />
      </div> : null}

      {(step === 4 || step === 5) ? <div className="space-y-4">
        {services.length ? <ul className="divide-y rounded-xl border" aria-label="Servicios activos">
          {services.map((service) => <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">{service.name}</span>
            <span className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{money.format(service.price)}</span>
              {step === 5 ? <Link href={`${base}/services?edit=${service.id}&returnStep=5#crm-form`}
                className="font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Editar</Link> : null}
            </span>
          </li>)}
        </ul> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay servicios activos. Agrega el primero para continuar.
        </p>}
        <Link href={`${base}/services?new=1&returnStep=${step}#crm-form`}
          className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {step === 4 ? "Agregar servicio" : "Agregar otro servicio"} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        {step === 5 ? <p className="text-xs text-muted-foreground">
          Si tienes más de 30 servicios, revisa el catálogo completo antes de confirmar.
        </p> : null}
      </div> : null}

      {step === 6 ? <div className="space-y-2">
        <label htmlFor="setup-value" className="text-sm font-medium">Cliente ideal</label>
        <textarea id="setup-value" name="value" defaultValue={value} maxLength={500} required rows={5}
          placeholder="Ej. Familias que buscan atención dental preventiva y cercana"
          aria-invalid={Boolean(state.message)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm" />
        <p className="text-xs text-muted-foreground">No incluyas información de pacientes reales.</p>
      </div> : null}

      {step === 7 ? <div className="space-y-2">
        <label htmlFor="setup-value" className="text-sm font-medium">Número de WhatsApp</label>
        <Input id="setup-value" name="value" defaultValue={value} maxLength={32} inputMode="tel"
          autoComplete="tel" placeholder="Ej. +52 222 123 4567" aria-invalid={Boolean(state.message)} />
        <p className="text-xs text-muted-foreground">Puedes dejarlo vacío y configurarlo más adelante.</p>
      </div> : null}

      {(step === 8 || step === 9) ? <fieldset className="space-y-3">
        <legend className="sr-only">{step === 8 ? "Tono de comunicación" : "Objetivo principal"}</legend>
        {(step === 8 ? TONES : GOALS).map((option) => <label key={option.value} className="block cursor-pointer">
          <input type="radio" name="value" value={option.value} defaultChecked={value === option.value}
            required className="peer sr-only" />
          <span className="flex min-h-16 flex-col justify-center rounded-xl border px-4 py-3 transition-colors hover:bg-muted/40 peer-checked:border-foreground peer-checked:bg-muted/60 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
            <span className="font-medium">{option.label}</span>
            {"description" in option && typeof option.description === "string"
              ? <span className="mt-0.5 text-sm text-muted-foreground">{option.description}</span> : null}
          </span>
        </label>)}
      </fieldset> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <Link href={step > 3 ? `${base}/setup?step=${step - 1}` : base}
          className="inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" aria-hidden="true" />{step > 3 ? "Anterior" : "Salir y continuar después"}
        </Link>
        <Button type="submit" size="lg" disabled={pending || needsService}>
          {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
          {pending ? "Guardando…" : step === 9 ? "Terminar configuración" : "Guardar y continuar"}
        </Button>
      </div>
    </form>
  );
}
