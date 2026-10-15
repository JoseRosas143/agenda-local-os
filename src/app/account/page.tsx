import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { SignOutForm } from "@/app/components/sign-out-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mi cuenta | Agenda Local OS", robots: { index: false, follow: false },
};
export default async function AccountPage() {
  // Required in the data-rendering page, not only in Proxy or a parent layout.
  const user = await requireUser();
  return (
    <main lang="es" className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <p className="flex items-center gap-2 font-semibold"><CalendarDays className="size-5" aria-hidden="true" />Agenda Local OS</p>
          <SignOutForm />
        </div>
      </header>
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-12">
        <div className="flex flex-col items-start gap-3">
          <Badge variant="secondary">Sesión verificada</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Tu cuenta está lista.</h1>
          <p className="text-muted-foreground">Este es tu acceso personal. Cada negocio tendrá sus propias membresías y permisos.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Tu acceso</CardTitle><CardDescription>Datos de la cuenta validada por Supabase Auth.</CardDescription></CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-5">
              <div className="flex flex-col gap-1"><dt className="text-sm text-muted-foreground">Correo electrónico</dt><dd className="break-all font-medium">{user.email}</dd></div>
              <div className="flex flex-col gap-1"><dt className="text-sm text-muted-foreground">Identificador de usuario</dt><dd className="break-all font-mono text-sm">{user.id}</dd></div>
            </dl>
          </CardContent>
          <CardFooter><p className="text-sm text-muted-foreground">La configuración guiada del negocio se incorporará en una etapa posterior. Esta pantalla no concede roles comerciales ni clínicos.</p></CardFooter>
        </Card>
      </section>
    </main>
  );
}
