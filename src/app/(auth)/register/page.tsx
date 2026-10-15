import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/session";
import { AuthShell } from "@/app/components/auth-shell";
import { AuthForm } from "@/app/components/auth-form";

export const metadata: Metadata = { title: "Crear cuenta | Agenda Local OS" };
export default async function RegisterPage() {
  if (await getVerifiedUser()) redirect("/account");
  return (
    <AuthShell title="Crea tu cuenta" description="Primero tu acceso personal. La configuración de tu negocio vendrá después."
      footer={<p className="text-sm text-muted-foreground">¿Ya tienes cuenta? <Link href="/login" className="text-foreground underline underline-offset-4">Iniciar sesión</Link></p>}>
      <AuthForm mode="register" />
    </AuthShell>
  );
}
