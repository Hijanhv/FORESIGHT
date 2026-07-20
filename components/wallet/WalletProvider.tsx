"use client";

/**
 * Solana wallet auth context (Sign-In-With-Solana).
 *
 * Connects an injected wallet (Phantom / Solflare / Backpack), asks it to sign
 * a free ownership message, and exchanges that for an httpOnly session cookie.
 * No wallet-adapter stack, no transaction, no SOL — identity only. The on-chain
 * "Called It" receipt is still posted server-side, now stamped with this wallet.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
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
  /** True when tapping connect will hand off to the Phantom app rather than sign in here. */
  handsOffToApp: boolean;
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

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a Macintosh UA; touch points are what disambiguate it.
  return (
    /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Marks a URL as "already handed off to Phantom". Phantom's documented detection
 * signal is the injected provider object, NOT the user agent — its in-app browser
 * is not guaranteed to say "Phantom" — so sniffing the UA to break the loop is
 * unsound. If injection is slow or fails there, a UA check sends us straight back
 * out to the deeplink and the app flickers open/closed forever. This marker rides
 * on the target URL, so it survives the hop into a completely separate webview
 * (where sessionStorage would not) and the handoff can only ever happen once.
 */
const HANDOFF_PARAM = "pw";

function handedOffAlready(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(HANDOFF_PARAM);
}

/**
 * Deeplink that reopens this exact page inside Phantom's in-app browser, which
 * *does* inject window.solana — so the normal SIWS flow below then runs there
 * unchanged. Both params must be URL-encoded.
 */
function phantomBrowseLink(): string {
  const here = new URL(window.location.href);
  here.searchParams.set(HANDOFF_PARAM, "1");
  const target = encodeURIComponent(here.toString());
  const ref = encodeURIComponent(window.location.origin);
  return `https://phantom.app/ul/browse/${target}?ref=${ref}`;
}

/**
 * Wallets inject at their own pace. Phantom announces itself with an event; the
 * short poll covers the ones that don't, then stops so we aren't ticking forever.
 */
function subscribeToProvider(onChange: () => void): () => void {
  window.addEventListener("phantom#initialized", onChange);
  const poll = setInterval(onChange, 200);
  const stop = setTimeout(() => clearInterval(poll), 3000);
  return () => {
    window.removeEventListener("phantom#initialized", onChange);
    clearInterval(poll);
    clearTimeout(stop);
  };
}

const providerSnapshot = () => !!getProvider();
const handoffSnapshot = () => isMobile() && !handedOffAlready();
const serverFalse = () => false;
const noopSubscribe = () => () => {};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wallet injection is external state, so subscribe to it rather than sampling
  // it once: Solflare and Backpack inject later than Phantom, and a single
  // synchronous check races them into reporting "no wallet" on a machine that
  // has one. The server snapshot is false, which keeps hydration in agreement.
  const hasProvider = useSyncExternalStore(subscribeToProvider, providerSnapshot, serverFalse);
  const mobileHandoff = useSyncExternalStore(noopSubscribe, handoffSnapshot, serverFalse);
  const handsOffToApp = !hasProvider && mobileHandoff;

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
      // A mobile browser has no extensions, so there is never an injected
      // provider here. Opening phantom.app in a new tab just triggers the
      // universal link with nothing to act on — the app launches and bounces
      // straight back out. Navigate (don't window.open) to the browse deeplink
      // so Phantom reopens this page in its own browser, where a provider does
      // exist and the flow below continues normally.
      if (isMobile() && !handedOffAlready()) {
        window.location.href = phantomBrowseLink();
        return null;
      }
      setError(
        isMobile()
          ? "Couldn't reach Phantom. Open phantom.app, then use its Browse tab to visit this page."
          : "No Solana wallet detected. Install the Phantom extension, then reload.",
      );
      return null;
    }

    setConnecting(true);
    try {
      const conn = await provider.connect();
      // Most wallets return { publicKey }; a few resolve connect() without it
      // and expose it on the provider instead — accept either.
      const pk = conn?.publicKey ?? provider.publicKey;
      if (!pk) throw new Error("Wallet did not return an address.");
      const address = pk.toString();

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
    <WalletContext.Provider
      value={{ wallet, connecting, error, hasProvider, handsOffToApp, signIn, signOut }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
