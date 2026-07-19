/**
 * Isomorphic Sign-In-With-Solana helpers — safe to import in both the browser
 * and the server. Keep this file free of Node built-ins (`node:crypto`, `fs`)
 * and heavy deps so it can land in the client bundle without pulling them in.
 *
 * The wallet signs a plain UTF-8 message (works in Phantom, Solflare, Backpack)
 * rather than the full Wallet-Standard `signIn` feature, so no wallet-adapter
 * stack is required. The server rebuilds this exact string to verify.
 */

/** httpOnly session cookie name. */
export const SESSION_COOKIE = "fs_session";

/** The human-readable intent shown to the fan inside their wallet. */
export const SIGNIN_STATEMENT =
  'Sign this free message to prove you own this wallet and attach your on-chain "Called It" receipts to it. This does not send a transaction or cost any SOL.';

export interface SignInFields {
  /** Site host, e.g. `foresight.vercel.app`. */
  domain: string;
  /** Base58 wallet address. */
  address: string;
  /** Server-issued, HMAC-signed nonce. */
  nonce: string;
  /** ISO-8601 timestamp derived from the nonce. */
  issuedAt: string;
}

/**
 * Build the exact message the wallet signs. Both the client (before signing)
 * and the server (before verifying) call this with identical fields, so any
 * tampering makes the Ed25519 check fail.
 */
export function buildSignInMessage({ domain, address, nonce, issuedAt }: SignInFields): string {
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    "",
    SIGNIN_STATEMENT,
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}
