/**
 * POST /api/auth/logout — clear the session cookie.
 */

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth-message";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
