import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "@/components/ui/card";

export function AuthShell({ title, description, children, footer }: {
  title: string; description: string; children: ReactNode; footer: ReactNode;
}) {
  return (
    <main lang="es" className="grid min-h-svh bg-background text-foreground lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r bg-muted/40 p-12 lg:flex xl:p-16">
        <Link href="/login" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <CalendarDays className="size-6" aria-hidden="true" /> Agenda Local OS
        </Link>
        <div className="flex max-w-md flex-col gap-6">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">J R Consulting</p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">El siguiente paso de tu negocio empieza aquí.</h2>
          <p className="text-base leading-relaxed text-muted-foreground">Una cuenta personal. Acceso a tus negocios. Permisos que respetan el trabajo de cada integrante.</p>
          <p className="flex items-center gap-2 text-sm"><ArrowRight className="size-4" aria-hidden="true" /> Construyendo tu sistema, paso a paso.</p>
        </div>
        <p className="text-sm text-muted-foreground">Agenda Local OS — entorno de desarrollo</p>
      </section>
      <section className="flex min-w-0 flex-col items-center justify-center gap-7 px-5 py-10 sm:px-8">
        <Link href="/login" className="flex items-center gap-2 font-semibold lg:hidden">
          <CalendarDays className="size-5" aria-hidden="true" /> Agenda Local OS
        </Link>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle><h1>{title}</h1></CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          <CardFooter className="flex flex-col items-start gap-3">{footer}</CardFooter>
        </Card>
      </section>
    </main>
  );
}
