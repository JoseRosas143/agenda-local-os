"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function AuthError({ reset }: { reset: () => void }) {
  return (
    <main lang="es" className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 p-6">
      <Alert variant="destructive"><AlertTitle>No pudimos completar la verificación</AlertTitle>
        <AlertDescription>Puede haber un problema temporal de conexión o configuración. No se mostrará información privada sin validar tu sesión.</AlertDescription>
      </Alert>
      <Button onClick={reset}>Volver a intentar</Button>
      <Link href="/login" className="text-sm underline underline-offset-4">Ir al inicio de sesión</Link>
    </main>
  );
}
