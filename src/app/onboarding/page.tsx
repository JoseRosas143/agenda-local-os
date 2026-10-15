import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { SignOutForm } from "@/app/components/sign-out-form";
import { CreateOrganizationForm } from "@/app/onboarding/create-organization-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Crea tu negocio | Agenda Local OS",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const user = await requireUser();
  return (
    <main lang="es" className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/account" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <CalendarDays className="size-5" aria-hidden="true" />Agenda Local OS
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="hidden max-w-44 truncate text-sm text-muted-foreground sm:block" title={user.email}>
              {user.email}
            </span>
            <SignOutForm />
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-2xl flex-col px-5 pb-16 pt-12 sm:pt-20">
        <div className="mb-9 text-center">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Configuración del negocio · Pasos 1 y 2 de 9</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Crea tu negocio</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Empecemos por el nombre y el tipo de negocio. Guardaremos tu avance para que continúes cuando quieras.
          </p>
        </div>
        <CreateOrganizationForm />
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Los demás detalles se configuran después de crear el negocio.
        </p>
        <Link href="/account" className="mt-5 self-center text-sm underline underline-offset-4">
          Volver a mi cuenta
        </Link>
      </section>
    </main>
  );
}
