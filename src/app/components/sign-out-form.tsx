"use client";

import { useActionState } from "react";
import { signOutAction } from "../../features/auth/actions";
import { INITIAL_AUTH_STATE } from "../../features/auth/types";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SignOutForm() {
  const [state, action, pending] = useActionState(signOutAction, INITIAL_AUTH_STATE);
  return (
    <form action={action} className="flex flex-col gap-3" aria-busy={pending}>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
        {pending ? "Cerrando…" : "Cerrar sesión"}
      </Button>
      {state.message ? <Alert variant="destructive" role="alert"><AlertDescription>{state.message}</AlertDescription></Alert> : null}
    </form>
  );
}
