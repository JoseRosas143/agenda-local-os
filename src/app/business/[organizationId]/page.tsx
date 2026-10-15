import Link from "next/link";
import { ArrowRight, ContactRound, BriefcaseBusiness } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/features/crm/context";

export default async function BusinessOverview({ params }: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await getBusinessContext(organizationId);
  const supabase = await createClient();
  const [contacts, services] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("archived_at", null),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
  ]);
  if (contacts.error || services.error) throw new Error("No pudimos cargar el resumen del negocio.");
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <h2 className="text-2xl font-semibold tracking-tight">Resumen</h2>
      <p className="mt-1 text-muted-foreground">Lo esencial de tu espacio de trabajo.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href={`/business/${organizationId}/contacts`} className="group flex items-center gap-4 rounded-xl border p-5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
          <ContactRound className="size-6 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-medium">Contactos</span><span className="text-sm text-muted-foreground">{contacts.count ?? 0} activos</span></span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link href={`/business/${organizationId}/services`} className="group flex items-center gap-4 rounded-xl border p-5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
          <BriefcaseBusiness className="size-6 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-medium">Servicios</span><span className="text-sm text-muted-foreground">{services.count ?? 0} activos</span></span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">Las oportunidades, citas y actividades se habilitarán cuando sus flujos de permisos y auditoría estén completos.</p>
    </section>
  );
}
