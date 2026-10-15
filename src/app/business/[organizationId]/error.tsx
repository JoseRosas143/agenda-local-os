"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function BusinessError({ reset }: { reset: () => void }) {
  return <section lang="es" className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-5 p-6">
    <Alert variant="destructive"><AlertTitle>No pudimos cargar este negocio</AlertTitle>
      <AlertDescription>Comprueba tu conexión y vuelve a intentarlo. No mostraremos datos sin validar tu acceso.</AlertDescription>
    </Alert>
    <Button onClick={reset}>Volver a intentar</Button>
    <Link href="/account" className="text-sm underline underline-offset-4">Volver a mis negocios</Link>
  </section>;
}
