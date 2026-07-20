"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * "Install Foresight" prompt.
 *
 * Foresight is a PWA (see app/manifest.ts, display: standalone) — there is no
 * app-store build, so "download the app" means adding it to the home screen.
 *
 * Chrome fires `beforeinstallprompt` for its own mini-infobar, but suppresses it
 * after a dismissal and behind engagement heuristics — which is why the prompt
 * "used to show and then stopped". We intercept the event, keep it, and drive our
 * own banner so the option is available on every visit. iOS Safari never fires it
 * at all, so there we show the manual Add to Home Screen path instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noopSubscribe = () => () => {};
const serverFalse = () => false;

/** Already installed — running from the home screen, so nothing to offer. */
function installedSnapshot(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari predates display-mode and exposes its own flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function iosSnapshot(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) // iPadOS reports as Mac
  );
}

export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  const alreadyInstalled = useSyncExternalStore(noopSubscribe, installedSnapshot, serverFalse);
  const isIOS = useSyncExternalStore(noopSubscribe, iosSnapshot, serverFalse);

  // Registering the worker is what makes the app installable at all — without it
  // Chrome never fires `beforeinstallprompt` and there is nothing to offer.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    // setState here runs inside event callbacks, not synchronously in the effect.
    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own infobar; we render the offer ourselves
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (alreadyInstalled || installed || dismissed) return null;
  // Nothing actionable: no captured prompt and not an iOS device with manual steps.
  if (!deferred && !isIOS) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <div className="flex items-center gap-3 rounded-xl border border-hot/30 bg-hot/[0.06] px-4 py-2.5">
        <span aria-hidden className="text-sm leading-none">
          📲
        </span>
        <p className="flex-1 font-mono text-[10px] leading-snug tracking-wide text-ink sm:text-[11px]">
          <span className="uppercase tracking-[0.14em] text-hot">Get the app</span>{" "}
          {isIOS && !deferred ? (
            <>
              Tap <span className="font-semibold">Share</span> then{" "}
              <span className="font-semibold">Add to Home Screen</span> to install Foresight.
            </>
          ) : (
            "Install Foresight on your phone — full screen, one tap from your home screen."
          )}
        </p>
        {deferred && (
          <button
            type="button"
            onClick={() => void install()}
            className="shrink-0 rounded-full border border-hot/50 bg-hot/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-hot transition-colors hover:bg-hot/20"
          >
            Install ↓
          </button>
        )}
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
