"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";

/**
 * Persistent "get Phantom" prompt.
 *
 * Deliberately NOT remembered across loads: dismissal lives in component state
 * only, so the banner returns on every visit in every browser for as long as no
 * wallet is connected. Previously the install path appeared only on a failed
 * connect, which a returning visitor with a live session cookie never saw again.
 */
export function GetPhantomBanner() {
  const { wallet, handsOffToApp } = useWallet();
  const [dismissed, setDismissed] = useState(false);

  // Nothing to install once they're signed in.
  if (wallet || dismissed) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <div className="flex items-center gap-3 rounded-xl border border-cool/30 bg-cool/[0.06] px-4 py-2.5">
        <span aria-hidden className="text-sm leading-none">
          ◎
        </span>
        <p className="flex-1 font-mono text-[10px] leading-snug tracking-wide text-ink sm:text-[11px]">
          <span className="uppercase tracking-[0.14em] text-cool">New here?</span>{" "}
          {handsOffToApp
            ? "Get the Phantom app to sign in and call goals on-chain."
            : "Get Phantom to sign in and call goals on-chain — free, no SOL needed."}
        </p>
        <a
          href="https://phantom.app/download"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-cool/50 bg-cool/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cool transition-colors hover:bg-cool/20"
        >
          Download ↗
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 font-mono text-[13px] leading-none text-muted transition-colors hover:text-hot"
        >
          ×
        </button>
      </div>
    </div>
  );
}
