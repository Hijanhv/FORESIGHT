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
  const { wallet, connecting, error, handsOffToApp, signIn, signOut } = useWallet();

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
    <span className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-hot/60 hover:text-hot disabled:opacity-60"
      >
        <span className="text-cool">◎</span>
        {connecting ? "connecting…" : handsOffToApp ? "Open in Phantom" : "Connect wallet"}
      </button>
      {error && (
        <span
          role="alert"
          className="absolute top-full right-0 z-20 mt-1.5 flex max-w-[15rem] flex-col items-end gap-0.5 text-right font-mono text-[10px] leading-snug text-hot"
        >
          {error}
          {/* Every failure here means "no usable wallet", so always leave a way
              to get one. The deeplink replaced the old window.open to phantom.app,
              which was the only install path anyone without Phantom had. */}
          <a
            href="https://phantom.app/download"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cool underline decoration-dotted hover:text-hot"
          >
            Get Phantom ↗
          </a>
        </span>
      )}
    </span>
  );
}
