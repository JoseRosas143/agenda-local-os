"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BusinessTabs({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const base = `/business/${organizationId}`;
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Resumen" },
    { href: `${base}/contacts`, label: "Contactos" },
    { href: `${base}/services`, label: "Servicios" },
    ...(canManage ? [{ href: `${base}/setup`, label: "Configuración" }] : []),
  ];
  return (
    <nav aria-label="Secciones del negocio" className="flex gap-7 overflow-x-auto border-b text-sm">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 py-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {tab.label}
        </Link>;
      })}
    </nav>
  );
}
