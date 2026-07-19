"use client";

/**
 * Solana wallet auth context (Sign-In-With-Solana).
 *
 * Connects an injected wallet (Phantom / Solflare / Backpack), asks it to sign
 * a free ownership message, and exchanges that for an httpOnly session cookie.
 * No wallet-adapter stack, no transaction, no SOL — identity only. The on-chain
 * "Called It" receipt is still posted server-side, now stamped with this wallet.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { buildSignInMessage } from "@/lib/auth-message";

interface SignMessageResult {
  signature: Uint8Array;
}
interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array, encoding?: string) => Promise<SignMessageResult>;
}

interface WalletContextValue {
  wallet: string | null;
  connecting: boolean;
  error: string | null;
  hasProvider: boolean;
  /** Connect + sign in. Resolves to the wallet address, or null on failure. */
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function getProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Detect an injected wallet once at mount (SSR-safe: getProvider() → null on
  // the server). Not rendered, so a server(false)/client(true) gap is harmless.
  const [hasProvider] = useState<boolean>(() => !!getProvider());

  // Hydrate any existing session after mount. setWallet runs inside the async
  // callback (allowed), not synchronously in the effect body.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { wallet: string | null }) => setWallet(d.wallet))
      .catch(() => {});
  }, []);

  const signIn = useCallback(async (): Promise<string | null> => {
    if (connecting) return wallet;
    setError(null);
    const provider = getProvider();
    if (!provider) {
      setError("No Solana wallet found. Install Phantom to sign in.");
      if (typeof window !== "undefined") {
        window.open("https://phantom.app/", "_blank", "noopener,noreferrer");
      }
      return null;
    }

    setConnecting(true);
    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();

      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Could not start sign-in.");
      const { nonce, issuedAt, domain } = (await nonceRes.json()) as {
        nonce: string;
        issuedAt: string;
        domain: string;
      };

      const message = buildSignInMessage({ domain, address, nonce, issuedAt });
      const { signature } = await provider.signMessage(new TextEncoder().encode(message), "utf8");

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature: toBase64(signature), nonce }),
      });
      const data = (await verifyRes.json()) as { wallet?: string; error?: string };
      if (!verifyRes.ok || !data.wallet) throw new Error(data.error ?? "Sign-in failed.");

      setWallet(data.wallet);
      return data.wallet;
    } catch (err) {
      // Phantom rejects a user-cancelled request with code 4001.
      const msg =
        typeof err === "object" && err && "code" in err && (err as { code: number }).code === 4001
          ? "Sign-in cancelled."
          : err instanceof Error
            ? err.message
            : "Sign-in failed.";
      setError(msg);
      return null;
    } finally {
      setConnecting(false);
    }
  }, [connecting, wallet]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      await getProvider()?.disconnect();
    } catch {}
    setWallet(null);
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, connecting, error, hasProvider, signIn, signOut }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
