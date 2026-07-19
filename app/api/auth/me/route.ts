/**
 * GET /api/auth/me — return the currently signed-in wallet (or null).
 * Used by the client to hydrate wallet state on load / after a refresh.
 */

import { cookies } from "next/headers";
import { readSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth-message";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = readSession(cookieStore.get(SESSION_COOKIE)?.value);
  return Response.json({ wallet: session?.wallet ?? null });
}
