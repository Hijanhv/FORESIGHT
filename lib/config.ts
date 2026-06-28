/**
 * Central config. Server-side values read from .env (see .env.example).
 * Defaults match the build kit so the app boots even before .env is filled in.
 */
export const config = {
  txline: {
    authUrl: process.env.TXLINE_AUTH_URL ?? "https://txline.txodds.com",
    apiUrl: process.env.TXLINE_API_URL ?? "https://txline-dev.txodds.com/api",
    /** Free World Cup real-time tier (odds + scores). */
    serviceLevelId: 12,
  },
  solana: {
    cluster: process.env.SOLANA_CLUSTER ?? "devnet",
    rpc: process.env.SOLANA_RPC ?? "https://api.devnet.solana.com",
    walletKeypairPath: process.env.WALLET_KEYPAIR_PATH ?? "./app-key.json",
  },
} as const;

/** TxLINE endpoints Foresight uses (also listed in the submission tech doc). */
export const txlineEndpoints = {
  guestStart: "/auth/guest/start", // on the auth host
  tokenActivate: "/token/activate",
  oddsStream: "/odds/stream",
  oddsSnapshot: (fixtureId: string) => `/odds/snapshot/${fixtureId}`,
  scoresStream: "/scores/stream",
  statValidation: (fixtureId: string, seq: number, statKey: number) =>
    `/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`,
  replay: (feed: "odds" | "scores", epochDay: number, hour: number, interval: number) =>
    `/${feed}/updates/${epochDay}/${hour}/${interval}`,
} as const;
