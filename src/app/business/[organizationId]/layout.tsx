import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { SignOutForm } from "@/app/components/sign-out-form";
import { getBusinessContext } from "@/features/crm/context";
import { BusinessTabs } from "./business-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Negocio | Agenda Local OS", robots: { index: false, follow: false },
};

export default async function BusinessLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const { organization } = await getBusinessContext(organizationId);
  return (
    <main lang="es" className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-14">
          <p className="flex items-center gap-2.5 font-semibold tracking-tight"><CalendarDays className="size-5" aria-hidden="true" />Agenda Local OS</p>
          <SignOutForm />
        </div>
      </header>
      <div className="px-5 pt-8 sm:px-8 sm:pt-10 lg:px-14">
        <Link href="/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" aria-hidden="true" />Mis negocios
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{organization.name}</h1>
        <div className="mt-5"><BusinessTabs organizationId={organizationId} /></div>
      </div>
      {children}
    </main>
  );
}
