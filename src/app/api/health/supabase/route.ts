import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  // Esta comprobación temporal solo estará disponible en desarrollo.
  if (process.env.NODE_ENV !== "development") {
    return json({ ok: false, error: "Not found" }, 404);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    return json(
      {
        ok: false,
        error: "Faltan variables de Supabase en .env.local.",
      },
      500
    );
  }

  // Evita utilizar accidentalmente una clave secreta en esta prueba.
  if (!key.startsWith("sb_publishable_")) {
    return json(
      {
        ok: false,
        error: "Esta prueba requiere una clave sb_publishable_.",
      },
      500
    );
  }

  try {
    const endpoint = new URL("/auth/v1/settings", url);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return json(
        {
          ok: false,
          service: "supabase-auth",
          status: response.status,
          error: "Supabase rechazó la petición de comprobación.",
        },
        502
      );
    }

    const settings: unknown = await response.json();

    if (
      typeof settings !== "object" ||
      settings === null ||
      !("external" in settings) ||
      typeof settings.external !== "object" ||
      settings.external === null
    ) {
      return json(
        {
          ok: false,
          error: "Supabase respondió con un formato inesperado.",
        },
        502
      );
    }

    // No devolvemos claves, sesiones ni la configuración completa.
    return json({
      ok: true,
      service: "supabase-auth",
      status: response.status,
    });
  } catch {
    return json(
      {
        ok: false,
        error:
          "No se pudo completar la petición a Supabase. Revisa la conexión y vuelve a intentar.",
      },
      502
    );
  }
}