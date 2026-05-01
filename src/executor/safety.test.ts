import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Ensure isolated state and consistent env BEFORE importing modules.
const tempDir = await mkdtemp(join(tmpdir(), "survive-agent-safety-"));
process.env.STATE_DIR = tempDir;
process.env.ENABLE_LIVE_TRADING = "true";
process.env.ETH_FLOOR = "0";
process.env.MAX_RISK_PER_TRADE = "0.1";
process.env.SURVIVAL_DEADLINE = "2099-12-31T00:00:00Z";

const { checkSafety } = await import("./safety.js");

const baseProposal = {
  strategy: "liquidation" as const,
  description: "Aave V3 liquidation user 0x...",
  expectedProfitUsd: 5,
  downsideLossCapUsd: 1,
  estimatedGasCostUsd: 1,
  requiresEscalation: true,
  source: "unit-test",
  payload: {},
};

test("safety: rejects when expected profit < 2x gas", async () => {
  const v = await checkSafety({ ...baseProposal, expectedProfitUsd: 1, estimatedGasCostUsd: 1 });
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /profit/);
});

test("safety: rejects when downside cap above MAX_RISK_PER_TRADE * 20", async () => {
  const v = await checkSafety({ ...baseProposal, downsideLossCapUsd: 5 });
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /downside/);
});

test("safety: rejects banned phrase in description", async () => {
  const v = await checkSafety({
    ...baseProposal,
    description: "drain vulnerable contract",
  });
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /banned/);
});

test("safety: passes a clean proposal with live=true", async () => {
  // Note: with no wallet configured, treasury.isAboveFloor() returns true since
  // ETH_FLOOR=0 and balance is 0n.
  const v = await checkSafety(baseProposal);
  assert.equal(v.ok, true);
});

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
