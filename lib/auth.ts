/**
 * Server-side Sign-In-With-Solana core: stateless nonces, wallet-signature
 * verification, and HMAC-signed session tokens. No new dependencies — Ed25519
 * verification uses Node's built-in `crypto`, mirroring `signMessage` in
 * `lib/solana.ts` (there we wrap the private seed in PKCS8; here we wrap the
 * public key in the matching SPKI envelope).
 *
 * Both nonce and session are stateless (HMAC over the payload), so nothing has
 * to be stored between requests — this survives serverless cold starts on
 * Vercel where an in-memory nonce store would not.
 */

import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { buildSignInMessage } from "@/lib/auth-message";

const NONCE_TTL_MS = 5 * 60 * 1000; // sign-in must complete within 5 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day login

/** DER SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_HEADER = Buffer.from("302a300506032b6570032100", "hex");

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail loud in prod rather than sign sessions with a public constant.
    throw new Error("AUTH_SECRET is not set — refusing to issue sessions with a default secret.");
  }
  return "foresight-dev-secret-change-me";
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", authSecret()).update(data).digest("base64url");
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Nonce ─────────────────────────────────────────────────────────────────────

/** Issue a stateless, single-window nonce: `<random>.<issuedAtMs>.<hmac>`. */
export function issueNonce(): { nonce: string; issuedAt: string } {
  const rand = crypto.randomBytes(16).toString("base64url");
  const ts = Date.now();
  const payload = `${rand}.${ts}`;
  return { nonce: `${payload}.${hmac(payload)}`, issuedAt: new Date(ts).toISOString() };
}

/** Verify a nonce's HMAC and freshness. Returns its issued-at ms, or null. */
export function verifyNonce(nonce: string): { issuedAtMs: number } | null {
  const parts = nonce.split(".");
  if (parts.length !== 3) return null;
  const [rand, ts, sig] = parts;
  if (!safeEqual(hmac(`${rand}.${ts}`), sig)) return null;
  const ms = Number(ts);
  if (!Number.isFinite(ms)) return null;
  const now = Date.now();
  if (now - ms > NONCE_TTL_MS) return null; // expired
  if (ms > now + 60_000) return null; // clock-skew / future-dated
  return { issuedAtMs: ms };
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify that `address` produced `signatureB64` over `message` (Ed25519).
 * Returns false for a malformed address/signature instead of throwing.
 */
export function verifyWalletSignature(address: string, message: string, signatureB64: string): boolean {
  try {
    const pubkey = new PublicKey(address).toBytes(); // 32 bytes, throws if invalid
    const der = Buffer.concat([ED25519_SPKI_HEADER, Buffer.from(pubkey)]);
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== 64) return false;
    return crypto.verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
}

/**
 * Full sign-in check: rebuild the signed message from the nonce (the server's
 * source of truth for issuedAt), confirm the nonce is valid and fresh, and
 * verify the Ed25519 signature. Returns the authenticated wallet, or null.
 */
export function verifySignIn(input: {
  domain: string;
  address: string;
  nonce: string;
  signature: string;
}): { wallet: string } | null {
  const n = verifyNonce(input.nonce);
  if (!n) return null;
  const issuedAt = new Date(n.issuedAtMs).toISOString();
  const message = buildSignInMessage({
    domain: input.domain,
    address: input.address,
    nonce: input.nonce,
    issuedAt,
  });
  if (!verifyWalletSignature(input.address, message, input.signature)) return null;
  return { wallet: input.address };
}

// ── Session ───────────────────────────────────────────────────────────────────

/** Mint an HMAC-signed session token: `<wallet>.<expMs>.<hmac>`. */
export function createSession(wallet: string): { token: string; maxAgeSec: number } {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${wallet}.${exp}`;
  return { token: `${payload}.${hmac(payload)}`, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) };
}

/** Validate a session token and return its wallet, or null. */
export function readSession(token: string | undefined | null): { wallet: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [wallet, exp, sig] = parts;
  if (!safeEqual(hmac(`${wallet}.${exp}`), sig)) return null;
  if (Date.now() > Number(exp)) return null;
  return { wallet };
}
