import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/components/auth-shell";
import { AuthForm } from "@/app/components/auth-form";

export const metadata: Metadata = { title: "Confirma tu correo | Agenda Local OS" };
export default function CheckEmailPage() {
  return (
    <AuthShell title="Revisa tu correo" description="Si el registro pudo procesarse y requiere confirmación, recibirás un enlace. Revisa también spam."
      footer={<Link href="/login" className="text-sm underline underline-offset-4">Volver a iniciar sesión</Link>}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">Si ya confirmaste tu cuenta, inicia sesión. Para solicitar otro enlace, escribe tu correo. Evita repetir envíos seguidos.</p>
        <AuthForm mode="resend" />
      </div>
    </AuthShell>
  );
}
