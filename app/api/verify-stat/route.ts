/**
 * "Verified on Solana" — surfaces TxLINE's Merkle proof that a match stat is
 * anchored on-chain. This is the hackathon thesis made visible: every data point
 * the app shows can be cryptographically proven against TxODDS's on-chain daily
 * scores root (their deployed `validateStat` view over `dailyScoresMerkleRoots`).
 *
 * Usage:  GET /api/verify-stat?fixtureId=<id>&seq=<n>&statKey=<1..8>
 */

import type { NextRequest } from "next/server";
import { guestStart, activateToken, fetchStatValidation } from "@/lib/txline/client";
import { buildWalletProof } from "@/lib/solana";

export const dynamic = "force-dynamic";

function isConfigured(): boolean {
  return !!(
    process.env.TXLINE_AUTH_URL &&
    process.env.TXLINE_API_URL &&
    (process.env.TXLINE_API_TOKEN ||
      process.env.WALLET_KEYPAIR_PATH ||
      process.env.WALLET_KEYPAIR_B64)
  );
}

async function getApiToken(jwt: string): Promise<string> {
  if (process.env.TXLINE_API_TOKEN) return process.env.TXLINE_API_TOKEN;
  const proof = await buildWalletProof(jwt, { serviceLevelId: 12, durationWeeks: 4 });
  return activateToken(jwt, {
    txSig: proof.txSig,
    walletSignature: proof.walletSignature,
    leagues: proof.leagues,
  });
}

const toHex = (bytes: number[]): string =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return Response.json({ error: "TxLINE env vars not set." }, { status: 503 });
  }
  const qp = request.nextUrl.searchParams;
  const fixtureId = qp.get("fixtureId");
  const seq = Number(qp.get("seq"));
  const statKey = Number(qp.get("statKey"));
  if (!fixtureId || !Number.isFinite(seq) || !Number.isFinite(statKey)) {
    return Response.json({ error: "fixtureId, seq and statKey are required." }, { status: 400 });
  }

  try {
    const jwt = await guestStart();
    const apiToken = await getApiToken(jwt);
    const proof = await fetchStatValidation({ jwt, apiToken }, fixtureId, seq, statKey);

    const proofDepth =
      (proof.statProof?.length ?? 0) +
      (proof.subTreeProof?.length ?? 0) +
      (proof.mainTreeProof?.length ?? 0);

    return Response.json({
      anchored: true,
      fixtureId,
      statKey: proof.statToProve?.key ?? statKey,
      value: proof.statToProve?.value,
      period: proof.statToProve?.period,
      eventStatRoot: toHex(proof.eventStatRoot ?? []),
      subTreeRoot: toHex(proof.summary?.eventStatsSubTreeRoot ?? []),
      proofDepth,
      updateCount: proof.summary?.updateStats?.updateCount,
      ts: proof.ts,
      // The on-chain program that holds the anchored daily-scores roots.
      program: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    });
  } catch (err) {
    // Not-yet-anchored stats (very recent live updates) return an error upstream.
    return Response.json({ anchored: false, error: String(err) }, { status: 200 });
  }
}
