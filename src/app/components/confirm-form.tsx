"use client";

import { useActionState } from "react";
import { confirmSignupAction } from "../../features/auth/actions";
import { INITIAL_AUTH_STATE } from "../../features/auth/types";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [state, action, pending] = useActionState(confirmSignupAction, INITIAL_AUTH_STATE);
  return (
    <form action={action} className="flex flex-col gap-5" aria-busy={pending}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value="email" />
      <p className="text-sm text-muted-foreground">Confirma solo si tú solicitaste esta cuenta. El enlace no se consume hasta que pulses el botón.</p>
      {state.message ? <Alert variant="destructive" role="alert"><AlertTitle>No se pudo confirmar</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
        {pending ? "Confirmando…" : "Confirmar mi correo"}
      </Button>
    </form>
  );
}
