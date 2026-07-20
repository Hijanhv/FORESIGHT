/**
 * "Called It" — the on-chain fan loop.
 *
 * When Foresight lights up (🔥 brewing) and a fan taps "I feel it", we write a
 * tamper-evident, timestamped memo on Solana recording that they called a goal
 * *before the market repriced*. The returned tx signature is a shareable,
 * verifiable receipt. Pure @solana/web3.js — no program of our own.
 *
 * Usage:  POST /api/called-it   { fixtureId, home, away, clockSeconds, phase,
 *                                 anticipation, marketProb, homeScore, awayScore }
 */

import type { NextRequest } from "next/server";
import { postCalledIt } from "@/lib/solana";
import { readSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth-message";

export const dynamic = "force-dynamic";

function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function hasWallet(): boolean {
  return !!(process.env.WALLET_KEYPAIR_PATH || process.env.WALLET_KEYPAIR_B64);
}

// Light throttle so a demo tap-storm can't drain the prover wallet.
let lastPostAt = 0;
const MIN_INTERVAL_MS = 1500;

function clock(s: number): string {
  const sec = Math.max(0, Math.round(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

interface CallBody {
  fixtureId?: string;
  home?: string;
  away?: string;
  clockSeconds?: number;
  anticipation?: number; // 0..1
  marketProb?: number; // 0..1, leading side's market prob
  homeScore?: number;
  awayScore?: number;
}

export async function POST(request: NextRequest) {
  if (!hasWallet()) {
    return Response.json(
      { error: "Prover wallet not configured (set WALLET_KEYPAIR_B64 or WALLET_KEYPAIR_PATH)." },
      { status: 503 },
    );
  }

  // Attribute the receipt to the signed-in fan: they must prove wallet
  // ownership (Sign-In-With-Solana) before we stamp their address on-chain.
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json(
      { error: "Connect your Solana wallet to call it." },
      { status: 401 },
    );
  }

  const now = Date.now();
  if (now - lastPostAt < MIN_INTERVAL_MS) {
    return Response.json({ error: "Too fast. Try again in a moment." }, { status: 429 });
  }
  lastPostAt = now;

  let body: CallBody;
  try {
    body = (await request.json()) as CallBody;
  } catch {
    body = {};
  }

  const home = (body.home ?? "HOME").slice(0, 24);
  const away = (body.away ?? "AWAY").slice(0, 24);
  const ant = Math.round((body.anticipation ?? 0) * 100);
  const mkt = Math.round((body.marketProb ?? 0) * 100);
  const score = `${body.homeScore ?? 0}-${body.awayScore ?? 0}`;
  const at = clock(body.clockSeconds ?? 0);

  const memo =
    `Foresight · Called It 🔥 | ${home} v ${away} | ${at} | ` +
    `anticipation ${ant}% vs market ${mkt}% | ${score} | by ${session.wallet} | ` +
    `${new Date(now).toISOString()}`;

  try {
    const receipt = await postCalledIt(memo);
    const base = "https://solscan.io/tx/";
    const explorerUrl =
      receipt.cluster === "mainnet-beta"
        ? `${base}${receipt.txSig}`
        : `${base}${receipt.txSig}?cluster=devnet`;
    return Response.json({
      ...receipt,
      explorerUrl,
      calledBy: session.wallet,
      calledByShort: shortWallet(session.wallet),
    });
  } catch (err) {
    lastPostAt = 0; // allow a retry on failure
    console.error("[called-it] on-chain post failed:", err);
    return Response.json({ error: humanChainError(err) }, { status: 500 });
  }
}

/**
 * Fans should never read a raw RPC dump. An unfunded prover wallet surfaced as
 * "Attempt to debit an account but found no record of a prior credit.. Logs: []
 * . Catch the `SendTransactionError` and call `getLogs()`" directly in the UI —
 * meaningless to a user and it leaks internals. The detail still reaches the
 * server log above; the fan gets something actionable.
 */
function humanChainError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/no record of a prior credit|insufficient (lamports|funds)/i.test(raw)) {
    return "The prover wallet is out of SOL — the receipt couldn't be posted. Try again shortly.";
  }
  if (/blockhash not found|block height exceeded/i.test(raw)) {
    return "Solana was busy and the receipt expired before it landed. Tap to try again.";
  }
  if (/timed out|timeout|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(raw)) {
    return "Couldn't reach Solana just now. Check your connection and tap again.";
  }
  if (/429|rate.?limit/i.test(raw)) {
    return "Solana is rate-limiting us right now. Give it a few seconds and tap again.";
  }
  return "Couldn't record your call on-chain. Tap to try again.";
}
