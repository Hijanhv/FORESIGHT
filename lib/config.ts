/**
 * Central config. Server-side values read from .env (see .env.example).
 * Defaults match the build kit so the app boots even before .env is filled in.
 */
export const config = {
  txline: {
    /** Auth host — guest/start and token/activate live here. */
    authUrl: process.env.TXLINE_AUTH_URL ?? "https://txline.txodds.com",
    /** Data API host — odds and scores streams live on the same host as auth. */
    apiUrl: process.env.TXLINE_API_URL ?? "https://txline.txodds.com/api",
  },
  solana: {
    cluster: process.env.SOLANA_CLUSTER ?? "devnet",
    rpc: process.env.SOLANA_RPC ?? "https://api.devnet.solana.com",
    walletKeypairPath: process.env.WALLET_KEYPAIR_PATH ?? "./app-key.json",
  },
} as const;

/** TxLINE path constants for the data API (all relative to apiUrl). */
export const txlineEndpoints = {
  guestStart: "/auth/guest/start", // on the auth host
  oddsStream: "/odds/stream",
  oddsSnapshot: (fixtureId: string) => `/odds/snapshot/${fixtureId}`,
  scoresStream: "/scores/stream",
  statValidation: (fixtureId: string, seq: number, statKey: number) =>
    `/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKey=${statKey}`,
  replay: (feed: "odds" | "scores", epochDay: number, hour: number, interval: number) =>
    `/${feed}/updates/${epochDay}/${hour}/${interval}`,
} as const;
