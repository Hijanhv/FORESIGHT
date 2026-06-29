# Foresight

> **Feel a goal coming before it happens.**

Foresight turns live soccer odds and pitch events into an anticipation engine. It lights up when on-pitch pressure surges but the market hasn't repriced yet — the trading-desk sixth sense, for every fan.

Powered by **TxLINE** live odds + events · verified on **Solana devnet**.

---

## How it works

```
TxLINE odds SSE  ─┐
                   ├─► normalise ─► engine (deterministic reducer) ─► ForesightFrame ─► gauge UI
TxLINE scores SSE ─┘
```

The **anticipation score** (0–100) measures the gap between on-pitch pressure (corners, cards) and market repricing. When pressure is high and the market hasn't moved yet, `brewing = true` — a goal may be imminent.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Without env vars the app runs in **synthetic demo mode**: a scripted 36-minute match (home corner barrage → goal at 36:00) loops at 60× speed. No API token needed.

---

## Live mode

Copy and fill in the env file:

```bash
cp .env.example .env.local
```

| Variable              | Description                 |
| --------------------- | --------------------------- |
| `TXLINE_AUTH_URL`     | TxLINE auth host            |
| `TXLINE_API_URL`      | TxLINE API host             |
| `SOLANA_CLUSTER`      | `devnet` or `mainnet-beta`  |
| `SOLANA_RPC`          | Solana RPC endpoint         |
| `WALLET_KEYPAIR_PATH` | Path to Solana keypair JSON |

Generate a keypair (devnet SOL is airdropped automatically):

```bash
solana-keygen new -o app-key.json
```

With env vars set, the gauge auto-connects to live TxLINE streams. Enter a fixture ID in the input field to watch a specific match.

---

## API routes

| Route                            | Description                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| `GET /api/gauge`                 | Synthetic demo — SSE stream of `ForesightFrame`, loops indefinitely |
| `GET /api/live?fixtureId=<id>`   | Live TxLINE stream for a fixture (503 if env not set)               |
| `GET /api/record?fixtureId=<id>` | Live stream + writes `logs/<id>.jsonl` for later replay             |

---

## Replay recorded matches

```ts
import { parseEventsJsonl, replay } from "@/lib/replay";
import fs from "node:fs";

const body = fs.readFileSync("logs/WC-2026-001.jsonl", "utf-8");
const events = parseEventsJsonl(body);

await replay(events, {
  speed: 60,
  onFrame: (frame) => console.log(frame.anticipation, frame.brewing),
});
```

---

## Architecture

```
app/
  api/
    gauge/route.ts       Synthetic SSE demo
    live/route.ts        Live TxLINE ingestion → SSE frames
    record/route.ts      Live ingestion + writes logs/*.jsonl
  page.tsx               Landing page

components/
  gauge/
    GaugeWidget.tsx      Live arc gauge (client component)
    MatchView.tsx        Fixture selector + gauge wrapper
  brand/logo.tsx         FsMark / FsLockup SVG components

lib/
  engine/
    anticipation.ts      Deterministic reducer: events → ForesightFrame
  replay/
    index.ts             Time-faithful replay harness
    synthetic.ts         Scripted match generator (no network needed)
  txline/
    client.ts            TxLINE SSE client (auth + streams)
    normalize.ts         Raw TxLINE payloads → UnifiedEvent
    types.ts             Raw wire shapes
  solana.ts              Keypair loading, Ed25519 signing, memo tx
  config.ts              Centralised env config

types/foresight.ts       Shared domain types (engine ↔ UI contract)
```

---

## Scripts

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # Production build
npm test             # Vitest unit tests
npm run lint         # ESLint
```

---

## Deploy to Vercel

```bash
vercel deploy
```

Set the env vars in your Vercel project dashboard. The SSE routes are configured for a 5-minute max duration in `vercel.json`.
