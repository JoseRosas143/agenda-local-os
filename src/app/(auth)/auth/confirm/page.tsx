import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/components/auth-shell";
import { ConfirmForm } from "@/app/components/confirm-form";
import { validConfirmation } from "@/features/auth/validation";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Confirmar cuenta | Agenda Local OS" };
export default async function ConfirmPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>,
}) {
  const { token_hash: token, type } = await searchParams;
  return (
    <AuthShell title="Confirma tu cuenta" description="Un paso más para activar tu acceso."
      footer={<><Link href="/auth/check-email" className="text-sm underline underline-offset-4">Solicitar otro enlace</Link><Link href="/login" className="text-sm underline underline-offset-4">Iniciar sesión</Link></>}>
      {validConfirmation(token, type) ? <ConfirmForm tokenHash={token} /> : (
        <Alert variant="destructive"><AlertTitle>Enlace incompleto</AlertTitle><AlertDescription>Abre el enlace del correo de confirmación o solicita uno nuevo.</AlertDescription></Alert>
      )}
    </AuthShell>
  );
}
