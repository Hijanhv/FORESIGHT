/**
 * POST /api/auth/verify — finish Sign-In-With-Solana.
 *
 * Body: { address, signature (base64), nonce }
 * On success, sets an httpOnly session cookie and returns { wallet }.
 * No transaction, no SOL — this only proves the fan controls the wallet.
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSession, verifySignIn } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth-message";

export const dynamic = "force-dynamic";

interface VerifyBody {
  address?: string;
  signature?: string;
  nonce?: string;
}

export async function POST(request: NextRequest) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    body = {};
  }

  const { address, signature, nonce } = body;
  if (!address || !signature || !nonce) {
    return Response.json({ error: "Missing address, signature, or nonce." }, { status: 400 });
  }

  const domain = request.headers.get("host") ?? new URL(request.url).host;
  const result = verifySignIn({ domain, address, nonce, signature });
  if (!result) {
    return Response.json({ error: "Signature verification failed or nonce expired." }, { status: 401 });
  }

  const { token, maxAgeSec } = createSession(result.wallet);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });

  return Response.json({ wallet: result.wallet });
}
