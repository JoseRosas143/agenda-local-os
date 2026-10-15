"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main lang="es" className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 p-6">
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar la configuración</AlertTitle>
        <AlertDescription>Puede haber un problema temporal de conexión. Inténtalo de nuevo.</AlertDescription>
      </Alert>
      <Button onClick={reset}>Volver a intentar</Button>
      <Link href="/account" className="text-sm underline underline-offset-4">Volver a mi cuenta</Link>
    </main>
  );
}
