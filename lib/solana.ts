/**
 * Solana wallet helpers for TxLINE activation.
 *
 * Auth flow:
 *   1. POST /auth/guest/start → JWT
 *   2. Execute subscribe on-chain instruction → txSig
 *   3. Build message: `${txSig}:${leagues.join(",")}:${jwt}`
 *   4. Sign with wallet Ed25519 key → walletSignature (base64)
 *   5. POST /api/token/activate { txSig, walletSignature, leagues } → API token
 *
 * Program IDs and token mints:
 *   DevNet:  6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J / GYdhNurtx2EgiTPRHVGuFWKHPycdpUqgedVkwEVUWVTC
 *   MainNet: 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA / sLX1i9dfmsuyFBmJTWuGjjRmG4VPWYK6dRRKSM4BCSx
 *
 * Free real-time tier: service_level_id=12, 0 TxL charged, World Cup + International Friendlies.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { config } from "@/lib/config";

export interface WalletProof {
  walletAddress: string;
  /** Base64 Ed25519 signature of `${txSig}:${leagues.join(",")}:${jwt}`. */
  walletSignature: string;
  /** Confirmed on-chain subscribe transaction signature. */
  txSig: string;
  leagues: number[];
}

// Anchor discriminator for `subscribe` (sha256("global:subscribe")[0..8])
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

// Per-cluster program and token-mint addresses
const CLUSTER_CONFIG = {
  devnet: {
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    tokenMint: new PublicKey("GYdhNurtx2EgiTPRHVGuFWKHPycdpUqgedVkwEVUWVTC"),
  },
  "mainnet-beta": {
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    tokenMint: new PublicKey("sLX1i9dfmsuyFBmJTWuGjjRmG4VPWYK6dRRKSM4BCSx"),
  },
} as const;

function clusterConfig() {
  const cluster = config.solana.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";
  return CLUSTER_CONFIG[cluster];
}

/** Expand `~` in keypair file paths. */
function resolveKeypairPath(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Load a keypair from a JSON secret-key byte array on disk. */
export function loadKeypair(filePath?: string): Keypair {
  const p = resolveKeypairPath(filePath ?? config.solana.walletKeypairPath);
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * Sign an arbitrary message with the keypair using Ed25519.
 * Uses Node.js built-in crypto — no extra deps.
 *
 * Solana secretKey = [32-byte seed | 32-byte pubkey].
 * Wrap the seed in a PKCS8 DER envelope so Node.js crypto accepts it.
 */
export function signMessage(keypair: Keypair, message: string): string {
  const seed = keypair.secretKey.slice(0, 32);
  const pkcs8Header = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([pkcs8Header, seed]),
    format: "der",
    type: "pkcs8",
  });
  return crypto.sign(null, Buffer.from(message), privateKey).toString("base64");
}

/** Build the exact message TxLINE expects before signing. */
export function buildActivationMessage(
  txSig: string,
  leagues: number[],
  jwt: string,
): string {
  return `${txSig}:${leagues.join(",")}:${jwt}`;
}

/**
 * Ensure the wallet has enough SOL.
 * On devnet, automatically requests an airdrop if the balance is low.
 * On mainnet, throws if the wallet is underfunded (user must fund manually).
 */
export async function ensureFunded(keypair: Keypair, minSol = 0.05): Promise<void> {
  const connection = new Connection(config.solana.rpc, "confirmed");
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance >= minSol * LAMPORTS_PER_SOL) return;

  if (config.solana.cluster !== "devnet") {
    throw new Error(
      `Wallet ${keypair.publicKey.toBase58()} needs at least ${minSol} SOL on mainnet. ` +
        "Fund it and retry.",
    );
  }

  const sig = await connection.requestAirdrop(keypair.publicKey, 0.1 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

/**
 * Execute the TxLINE `subscribe` instruction on-chain and return the tx signature.
 *
 * Free real-time tier: serviceLevelId=12, durationWeeks=4, leagues=[].
 * No TxL tokens are debited for service level 12 (the pricing matrix stores price=0).
 *
 * The instruction data layout (Anchor):
 *   [0..8]  discriminator  [254, 28, 191, 138, 156, 179, 183, 53]
 *   [8..10] service_level_id  u16 LE
 *   [10]    weeks             u8
 */
export async function subscribeOnChain(
  keypair: Keypair,
  opts: { serviceLevelId?: number; durationWeeks?: number } = {},
): Promise<string> {
  const { serviceLevelId = 12, durationWeeks = 4 } = opts;
  const { programId, tokenMint } = clusterConfig();
  const connection = new Connection(config.solana.rpc, "confirmed");

  // PDA: pricing_matrix
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    programId,
  );
  // PDA: token_treasury_pda (owns the vault)
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    programId,
  );
  // ATA: treasury vault that collects subscription fees
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    tokenMint,
    tokenTreasuryPda,
    true, // allowOwnerOffCurve=true for PDAs
    TOKEN_2022_PROGRAM_ID,
  );
  // ATA: user's TxL token account (may not exist; free tier charges 0 tokens)
  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Encode instruction data: discriminator + u16 + u8
  const slIdBuf = Buffer.allocUnsafe(2);
  slIdBuf.writeUInt16LE(serviceLevelId, 0);
  const data = Buffer.concat([SUBSCRIBE_DISCRIMINATOR, slIdBuf, Buffer.from([durationWeeks])]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: pricingMatrixPda, isSigner: false, isWritable: false },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  return sendAndConfirmTransaction(connection, tx, [keypair]);
}

/**
 * Full proof flow — returns everything activateToken() needs.
 * Sequential by design: walletSignature depends on txSig.
 */
export async function buildWalletProof(
  jwt: string,
  opts: {
    keypairPath?: string;
    serviceLevelId?: number;
    durationWeeks?: number;
    leagues?: number[];
  } = {},
): Promise<WalletProof> {
  const { keypairPath, leagues = [], serviceLevelId = 12, durationWeeks = 4 } = opts;
  const keypair = loadKeypair(keypairPath);

  await ensureFunded(keypair);

  // 1. Subscribe on-chain → get txSig
  const txSig = await subscribeOnChain(keypair, { serviceLevelId, durationWeeks });

  // 2. Sign the exact message TxLINE validates: txSig:leagues:jwt
  const message = buildActivationMessage(txSig, leagues, jwt);
  const walletSignature = signMessage(keypair, message);

  return {
    walletAddress: keypair.publicKey.toBase58(),
    walletSignature,
    txSig,
    leagues,
  };
}
