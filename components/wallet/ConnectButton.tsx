"use client";

import { useWallet } from "./WalletProvider";

function short(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/**
 * Header wallet control: "Connect wallet" → a free Sign-In-With-Solana, then a
 * pill showing the signed-in address with a one-tap disconnect.
 */
export function ConnectButton() {
  const { wallet, connecting, signIn, signOut } = useWallet();

  if (wallet) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-goal/40 bg-goal/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-goal" />
        <span title={wallet}>◎ {short(wallet)}</span>
        <button
          type="button"
          onClick={signOut}
          aria-label="Disconnect wallet"
          className="text-muted transition-colors hover:text-hot"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void signIn()}
      disabled={connecting}
      className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-hot/60 hover:text-hot disabled:opacity-60"
    >
      <span className="text-cool">◎</span>
      {connecting ? "connecting…" : "Connect wallet"}
    </button>
  );
}
