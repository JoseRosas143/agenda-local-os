import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext, isUuid } from "@/features/crm/context";
import type { ServiceValues } from "@/features/crm/validation";
import { ServiceForm } from "../service-form";

const PAGE_SIZE = 20;
function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ServicesPage({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const { organization, canManage } = await getBusinessContext(organizationId);
  const rawPage = one(query.page) ?? "1";
  const page = /^\d{1,4}$/.test(rawPage) ? Math.max(1, Math.min(1000, Number(rawPage))) : 1;
  const editId = one(query.edit);
  if (editId && (!canManage || !isUuid(editId))) notFound();
  const showCreate = canManage && one(query.new) === "1";
  const showForm = showCreate || Boolean(editId);
  const supabase = await createClient();
  const listPromise = supabase.from("services")
    .select("id,code,name,description,price,duration_minutes,active", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const editPromise = editId
    ? supabase.from("services").select("id,code,name,description,price,duration_minutes,active")
      .eq("organization_id", organizationId).eq("id", editId).maybeSingle()
    : Promise.resolve(null);
  const [list, selected] = await Promise.all([listPromise, editPromise]);
  if (list.error || selected?.error) throw new Error("No pudimos cargar los servicios.");
  if (editId && !selected?.data) notFound();
  const initial: ServiceValues | undefined = selected?.data ? {
    code: selected.data.code, name: selected.data.name,
    description: selected.data.description ?? "", price: String(selected.data.price),
    durationMinutes: selected.data.duration_minutes ? String(selected.data.duration_minutes) : "",
    active: selected.data.active,
  } : undefined;
  const base = `/business/${organizationId}/services`;
  const count = list.count ?? 0;
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: organization.currency });
  return (
    <section className={showForm ? "lg:pr-[464px]" : ""}>
      <div className="min-w-0 px-5 py-10 sm:px-8 lg:px-14">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Servicios</h2><p className="mt-1 text-muted-foreground">Tu catálogo, claro y siempre a mano.</p></div>
          {canManage ? <Link href={`${base}?new=1#crm-form`} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Plus className="size-4" aria-hidden="true" />Nuevo servicio</Link> : null}
        </div>
        {(one(query.created) === "1" || one(query.updated) === "1") ? <Alert role="status" className="mt-6"><AlertDescription>Servicio {one(query.created) === "1" ? "creado" : "actualizado"} correctamente.</AlertDescription></Alert> : null}
        {list.data?.length ? <div className="mt-8 overflow-hidden rounded-xl border"><ul className="divide-y" aria-label="Lista de servicios">
          {list.data.map((service) => <li key={service.id}>
            {canManage ? <Link href={`${base}?edit=${service.id}&page=${page}#crm-form`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="min-w-0"><span className="block font-medium">{service.name}</span><span className="mt-0.5 block text-sm text-muted-foreground">{service.code}{service.duration_minutes ? ` · ${service.duration_minutes} min` : ""}</span></span>
              <span className="text-right"><span className="block text-sm font-medium">{money.format(Number(service.price))}</span><span className="text-xs text-muted-foreground">{service.active ? "Activo" : "Inactivo"}</span></span>
            </Link> : <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0"><span className="block font-medium">{service.name}</span><span className="mt-0.5 block text-sm text-muted-foreground">{service.code}{service.duration_minutes ? ` · ${service.duration_minutes} min` : ""}</span></span>
              <span className="text-right"><span className="block text-sm font-medium">{money.format(Number(service.price))}</span><span className="text-xs text-muted-foreground">{service.active ? "Activo" : "Inactivo"}</span></span>
            </div>}
          </li>)}
        </ul></div> : <div className="flex min-h-[30rem] flex-col items-center justify-center px-5 py-12 text-center">
          <span className="mb-5 rounded-full border bg-muted/40 p-6"><BriefcaseBusiness className="size-9 text-muted-foreground" aria-hidden="true" /></span>
          <h3 className="text-xl font-semibold tracking-tight">{page === 1 ? "Aún no hay servicios" : "No hay más servicios"}</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{page === 1 ? "Agrega un servicio para empezar a organizar tu catálogo." : "Vuelve a la página anterior para seguir revisando."}</p>
          {canManage && page === 1 ? <Link href={`${base}?new=1#crm-form`} className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80">Agregar servicio</Link> : null}
        </div>}
        {count > PAGE_SIZE ? <nav aria-label="Páginas de servicios" className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`${base}?page=${page - 1}`} className="underline underline-offset-4">Anterior</Link> : <span />}
          <span className="text-muted-foreground">Página {page} de {Math.ceil(count / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < count ? <Link href={`${base}?page=${page + 1}`} className="underline underline-offset-4">Siguiente</Link> : <span />}
        </nav> : null}
      </div>
      {showForm ? <div id="crm-form"><ServiceForm key={editId ?? "new"} organizationId={organizationId} serviceId={editId ?? null} currency={organization.currency} initial={initial} /></div> : null}
    </section>
  );
}
