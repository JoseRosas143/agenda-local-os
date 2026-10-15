import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/session";
import { AuthShell } from "@/app/components/auth-shell";
import { AuthForm } from "@/app/components/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Iniciar sesión | Agenda Local OS" };
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[] }>,
}) {
  if (await getVerifiedUser()) redirect("/account");
  const params = await searchParams;
  return (
    <AuthShell title="Bienvenido de nuevo" description="Entra con tu cuenta de Agenda Local OS."
      footer={<><p className="text-sm text-muted-foreground">¿Aún no tienes cuenta? <Link href="/register" className="text-foreground underline underline-offset-4">Crear cuenta</Link></p><Link href="/auth/check-email" className="text-sm underline underline-offset-4">Confirmar mi correo</Link></>}>
      <div className="flex flex-col gap-5">
        {params.status === "signed-out" ? <Alert role="status"><AlertDescription>Sesión cerrada en este navegador.</AlertDescription></Alert> : null}
        <AuthForm mode="login" />
      </div>
    </AuthShell>
  );
}
