/**
 * GET /api/auth/nonce — start a Sign-In-With-Solana handshake.
 *
 * Returns a stateless, HMAC-signed nonce plus the site domain and issued-at
 * timestamp. The client feeds these into `buildSignInMessage` and asks the
 * wallet to sign the result; /api/auth/verify rebuilds the same message.
 */

import type { NextRequest } from "next/server";
import { issueNonce } from "@/lib/auth";

export const dynamic = "force-dynamic";

function domainOf(request: NextRequest): string {
  return request.headers.get("host") ?? new URL(request.url).host;
}

export async function GET(request: NextRequest) {
  const { nonce, issuedAt } = issueNonce();
  return Response.json({ nonce, issuedAt, domain: domainOf(request) });
}
