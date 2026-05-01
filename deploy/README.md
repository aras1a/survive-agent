# Deployment Guide — Netcup VPS 2000 ARM G11

Tested target: **Ubuntu 22.04.5 LTS, ARM64, UEFI**.

## Quick install

```bash
sudo bash deploy/setup-vps.sh
```

The script:
- creates a dedicated `survive` user
- installs Node 22 via nvm under that user
- clones this repo to `/home/survive/survive-agent`
- runs `npm install` + `npm run build`
- installs the systemd unit at `/etc/systemd/system/survive-agent.service`
- enables a basic UFW firewall (SSH only)

## Configuration

Edit `/home/survive/survive-agent/.env` with:

| Var | What |
| --- | --- |
| `BASE_RPC_URL` | Reliable Base RPC (Alchemy/Quicknode preferred — free RPC throttles fast). |
| `PRIVATE_KEY` | 64-hex (no `0x`). The wallet that holds the $20 ETH. |
| `DEADLINE_SWEEP_ADDRESS` | Where to send residual ETH at deadline (28 May 2026). |
| `MIMO_API_KEY` | From https://platform.xiaomimimo.com — primary LLM. |
| `ANTHROPIC_API_KEY` | Cadangan (escalation only). |
| `ENABLE_LIVE_TRADING` | Keep `false` until you've reviewed dry-run output. |
| `FORTA_API_KEY` | Optional, enables exploit alerts. |

The agent will refuse to broadcast txs unless `ENABLE_LIVE_TRADING=true` AND each
proposal passes safety + escalation review.

## Operate

```bash
sudo systemctl start survive-agent
sudo systemctl enable survive-agent       # auto-start on reboot
journalctl -u survive-agent -f            # follow logs

# One-off ops
cd /home/survive/survive-agent
sudo -u survive npm run status
sudo -u survive npm run llm:ping
sudo -u survive npm run event:test
```

## Stop / Pause

```bash
sudo systemctl stop survive-agent
```

You can also flip `ENABLE_LIVE_TRADING=false` in `.env` and `systemctl reload`,
or set the treasury halt flag programmatically (see `treasury.halt()` in code).

## Updating

```bash
sudo -u survive bash -lc '
  cd ~/survive-agent
  git pull --ff-only
  npm install
  npm run build
'
sudo systemctl restart survive-agent
```

## Cost & deadline considerations

- VPS rents until **28 May 2026**. The agent enforces this deadline:
  at `SURVIVAL_DEADLINE` it halts, and (when live + sweep address set) sends
  residual ETH to `DEADLINE_SWEEP_ADDRESS` minus a tx-fee reserve.
- `data/llm-budget.json` accumulates LLM cost estimates.
  - Anthropic is hard-capped at `ANTHROPIC_BUDGET_USD` ($10 default).
  - MIMO is soft-tracked (100T credit ≫ practical use).
- `data/treasury.json` tracks ETH high-water mark and halt flag.
- `data/execution-log.json` is the agent's append-only attempt log.

## Hardening

- The systemd unit runs with `ProtectSystem=strict`, no new privileges, and
  read-write only to `data/`.
- The wallet's private key lives in `.env` (mode `0600`). Treat the VPS like
  a hot wallet — only fund it with what you can afford to lose.
- Consider creating a fresh wallet specifically for this agent so the blast
  radius is bounded.
