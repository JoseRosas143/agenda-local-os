import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SignOutForm } from "@/app/components/sign-out-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mi cuenta | Agenda Local OS", robots: { index: false, follow: false },
};
export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ created?: string | string[] }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: organizations, error } = await supabase.from("organizations")
    .select("id,name,slug,industry,timezone,currency")
    .order("created_at", { ascending: false });
  const params = await searchParams;
  return (
    <main lang="es" className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p className="flex items-center gap-2.5 font-semibold tracking-tight"><CalendarDays className="size-5" aria-hidden="true" />Agenda Local OS</p>
          <SignOutForm />
        </div>
      </header>
      <section className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-12 sm:py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mis negocios</h1>
          <p className="mt-2 text-muted-foreground">Administra los espacios a los que tienes acceso.</p>
        </div>
        {params.created === "1" && !error && organizations?.length ? (
          <Alert role="status"><AlertDescription>Tu negocio se creó correctamente.</AlertDescription></Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive"><AlertDescription>No pudimos cargar tus negocios. Vuelve a intentarlo más tarde.</AlertDescription></Alert>
        ) : organizations?.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {organizations.map((organization) => (
              <div key={organization.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
                <div>
                  <h2 className="font-semibold">{organization.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{organization.slug} · {organization.currency} · {organization.timezone}</p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {organization.industry === "dental" ? "Dental" : organization.industry === "medical" ? "Médico" : "General"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card px-6 py-8 sm:px-8">
            <h2 className="text-xl font-semibold tracking-tight">Tu espacio empieza aquí</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Crea un negocio para organizar a tu equipo. Solo necesitas los datos esenciales para comenzar.
            </p>
          </div>
        )}
        {!error ? (
          <Link href="/onboarding" className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {organizations?.length ? "Crear otro negocio" : "Crear mi negocio"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
        <p className="border-t pt-6 text-sm text-muted-foreground">Sesión iniciada como <span className="break-all font-medium text-foreground">{user.email}</span></p>
      </section>
    </main>
  );
}
