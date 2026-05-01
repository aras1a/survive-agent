# survive-agent

Autonomous on-chain reactor agent for Base L2. Watches exploit news, Forta
alerts, and on-chain anomalies. When something interesting happens, it triages
with a cheap LLM (MIMO V2.5 Flash), routes to a strategy module, and only
forwards the resulting proposal for execution **if** safety gates and a
high-tier escalation review approve it.

> ⚠️ **Capital-preservation first.** Live trading is **disabled by default**.
> The first runs of this agent should be dry-run only. The MVP shipped here
> wires up the full event → triage → strategy → proposal pipeline but does
> **not** ship a live broadcasting adapter — you have to add per-strategy
> swap/liquidation transaction builders and review them yourself before
> flipping `ENABLE_LIVE_TRADING=true`.

## Hard scope rules baked into the agent

- **No attacking** vulnerable contracts. The triage / analysis prompts are
  explicit about this and the safety gate filters proposals whose description
  contains banned phrases (`drain`, `sandwich`, `front-run user`, etc).
- **No sandwich / harmful MEV.**
- **No exploit-the-victim.** Strategies only react to *aftermath* events
  (price dislocation, liquidation cascade, distressed-asset entry).
- **No live tx until every strategy has a reviewed, tested broadcast adapter.**

## Architecture

```
┌─ Event sources ─────────────┐
│ rekt.news RSS               │
│ Forta GraphQL (HIGH/CRIT)   │
│ Base chain block tail       │
└──────────────┬──────────────┘
               ▼
┌─ Triage (MIMO V2.5 Flash) ──┐  cheap classifier
└──────────────┬──────────────┘
               ▼
┌─ Strategy router ───────────┐
│ post-exploit arb (MIMO Pro) │
│ liquidation hunter (Aave)   │
│ distressed asset (off by    │
│  default, MIMO Pro analyst) │
└──────────────┬──────────────┘
               ▼
┌─ Safety gate ───────────────┐  cheap, deterministic
│ live? halt? floor? 2x gas?  │
│ downside cap? banned terms? │
└──────────────┬──────────────┘
               ▼
┌─ Escalation (Anthropic) ────┐  $10 budget, gated
└──────────────┬──────────────┘
               ▼
┌─ Executor ──────────────────┐
│ dry-run by default          │
│ broadcast adapter TODO      │
└──────────────┬──────────────┘
               ▼
┌─ Treasury / survival ───────┐
│ ETH balance + drawdown      │
│ deadline 28 May 2026        │
│ auto-halt on floor breach   │
│ deadline-sweep on expiry    │
└─────────────────────────────┘
```

## LLM budget model

- **MIMO V2.5 Flash** ($0.11 / $0.32 per MTok) — default for triage and any
  per-event classification. Effectively unlimited at the credit you have.
- **MIMO V2.5 Pro** ($1.05 / $3.15 per MTok) — used for analysis steps that
  need real reasoning (post-exploit identification, distressed-asset eval).
- **Anthropic** — only invoked as the **escalation** layer right before live
  execution. Hard-capped via `ANTHROPIC_BUDGET_USD` (default $10).

Budget bookkeeping lives in `data/llm-budget.json` and is enforced before
each call (see `src/llm/budget.ts`).

## Repo layout

```
src/
├── cli.ts                CLI entry: agent | status | event-test | llm-ping
├── config.ts             zod-validated env
├── logger.ts             pino
├── chain/                Base RPC + Aave/UniV2 ABIs + addresses
├── llm/                  MIMO+Anthropic client, budget, pricing, prompts
├── events/               poll-based sources + manager (rekt, forta, chain tail)
├── strategies/           postExploitArb, liquidationHunter, distressedAsset
├── executor/             safety gate + executor (dry-run by default)
├── treasury/             treasury, survival/deadline manager
├── agent/                triage + main orchestration loop
└── utils/                state store + time helpers
deploy/
├── setup-vps.sh          one-shot installer for the Netcup ARM VPS
├── survive-agent.service systemd unit
└── README.md             VPS deployment guide
```

## Local quickstart

```bash
npm install
cp .env.example .env
# minimum: set MIMO_API_KEY (and BASE_RPC_URL for chain features)

npm run build
npm test

# Smoke test the LLM client
npm run llm:ping

# Dry-run an exploit-alert event end to end (triage only)
npm run event:test

# Print agent + treasury status JSON
npm run status

# Run the full loop in dry-run
npm run agent:dry
```

## Production deploy

See [`deploy/README.md`](deploy/README.md). One-shot:

```bash
sudo bash deploy/setup-vps.sh
```

## What is intentionally NOT in this MVP

- Live broadcasting adapters per strategy. The `Executor` will refuse to
  send a real tx; flipping `ENABLE_LIVE_TRADING=true` only unlocks the
  safety gates — adapter implementation is the next deliverable.
- Indexer-backed liquidation candidate discovery (Aave subgraph poller).
  The liquidation strategy currently expects candidates to be passed in
  via the event payload.
- Mempool subscription with `eth_subscribe` (only block-tail polling).
- Persistent metrics / Prometheus exporter.
- Telegram alert delivery (env vars are reserved; sender not yet wired).

These are the obvious next PRs if the framework is approved.

## License

Private — for the requester's use only.
