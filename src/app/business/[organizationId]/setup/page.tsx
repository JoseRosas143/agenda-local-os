import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/features/crm/context";
import { isOnboardingStep, type OnboardingStep } from "@/features/organizations/onboarding-validation";
import { SetupStepForm } from "./setup-step-form";

export const metadata: Metadata = {
  title: "Configura tu negocio | Agenda Local OS",
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function BusinessSetupPage({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const { organization, canManage } = await getBusinessContext(organizationId);
  if (!canManage) notFound();
  const query = await searchParams;
  const supabase = await createClient();
  const [profileResult, servicesResult] = await Promise.all([
    supabase.from("business_profiles")
      .select("city,ideal_customer,whatsapp_phone,tone,primary_goal,onboarding_step,onboarding_completed_at")
      .eq("organization_id", organizationId).maybeSingle(),
    supabase.from("services").select("id,name,price")
      .eq("organization_id", organizationId).eq("active", true)
      .order("created_at", { ascending: true }).limit(30),
  ]);
  if (profileResult.error || servicesResult.error) {
    throw new Error("No pudimos cargar la configuración del negocio.");
  }
  const profile = profileResult.data;
  const completed = Boolean(profile?.onboarding_completed_at);
  const nextStep = Math.max(3, Math.min(9, (profile?.onboarding_step ?? 2) + 1)) as OnboardingStep;
  const rawStep = one(query.step);
  const requested = rawStep && /^\d$/.test(rawStep) ? Number(rawStep) : null;
  if (rawStep && (requested === null || !isOnboardingStep(requested))) {
    redirect(`/business/${organizationId}/setup`);
  }
  if (requested !== null && !completed && requested > nextStep) {
    redirect(`/business/${organizationId}/setup?step=${nextStep}`);
  }
  const step = (requested ?? nextStep) as OnboardingStep;
  const base = `/business/${organizationId}`;

  if (completed && requested === null) return (
    <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-20">
      <div className="rounded-2xl border bg-card p-7 shadow-sm sm:p-10">
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
        <h2 className="mt-5 text-3xl font-semibold tracking-tight">Tu Agenda Local OS está lista.</h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
          Guardamos la información esencial de tu negocio. Puedes actualizarla cuando lo necesites.
        </p>
        {organization.industry !== "general" ? <p className="mt-5 rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          La configuración clínica de roles y plantillas vendrá en un paso separado. Aún no hay expedientes ni permisos clínicos habilitados.
        </p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={base} className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-ring">
            Ir a mi negocio <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href={`${base}/setup?step=3`} className="inline-flex h-11 items-center rounded-md border px-5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            Revisar configuración
          </Link>
        </div>
      </div>
    </section>
  );

  const initial = step === 3 ? profile?.city
    : step === 6 ? profile?.ideal_customer
    : step === 7 ? profile?.whatsapp_phone
    : step === 8 ? profile?.tone
    : step === 9 ? profile?.primary_goal : null;

  return (
    <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Configuración del negocio · Paso {step} de 9</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-label="Progreso de configuración" aria-valuenow={step - 1} aria-valuemin={0} aria-valuemax={9}>
          <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${((step - 1) / 9) * 100}%` }} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Nombre e industria ya están guardados: <span className="font-medium text-foreground">{organization.name}</span>
          {" · "}{organization.industry === "general" ? "General" : organization.industry === "dental" ? "Dental" : "Médico"}.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <SetupStepForm key={step} organizationId={organizationId} step={step}
          currency={organization.currency} initial={initial ?? ""}
          services={(servicesResult.data ?? []).map((service) => ({
            id: service.id, name: service.name, price: Number(service.price),
          }))} />
      </div>
    </section>
  );
}
