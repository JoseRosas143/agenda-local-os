import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };
export async function GET() {
  try {
    const user = await getVerifiedUser();
    if (!user) return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED" }, { status: 401, headers },
    );
    return NextResponse.json({ ok: true, user }, { headers });
  } catch {
    return NextResponse.json(
      { ok: false, error: "AUTH_UNAVAILABLE" }, { status: 503, headers },
    );
  }
}
