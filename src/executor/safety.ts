import { parseEther } from "ethers";
import { env, isLiveTradingEnabled } from "../config.js";
import { logger } from "../logger.js";
import type { TradeProposal } from "../strategies/types.js";
import { treasury } from "../treasury/treasury.js";
import { survival } from "../treasury/survival.js";

export interface SafetyVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Pre-flight gate. Run BEFORE simulating, BEFORE asking LLM to escalate, and
 * BEFORE broadcasting. Cheap checks first.
 */
export async function checkSafety(proposal: TradeProposal): Promise<SafetyVerdict> {
  // 1. Live trading must be enabled.
  if (!isLiveTradingEnabled()) {
    return { ok: false, reason: "ENABLE_LIVE_TRADING=false" };
  }

  // 2. Past deadline => no new trades.
  const s = survival.status();
  if (s.pastDeadline) {
    return { ok: false, reason: "past survival deadline" };
  }

  // 3. Treasury halt flag.
  if (await treasury.isHalted()) {
    return { ok: false, reason: "treasury halted" };
  }

  // 4. Balance floor.
  if (!(await treasury.isAboveFloor())) {
    return { ok: false, reason: "balance below ETH_FLOOR" };
  }

  // 5. Profitability gate (must clear 2x gas).
  if (proposal.expectedProfitUsd < 2 * proposal.estimatedGasCostUsd) {
    return { ok: false, reason: "expected profit below 2x gas" };
  }

  // 6. Downside cap must be at most MAX_RISK_PER_TRADE * treasury USD-equivalent.
  //    We don't have a reliable USD oracle here so we cap downside in absolute USD terms.
  //    Treat $20 as the conservative starting treasury value if not provided.
  const treasuryUsdProxy = 20;
  if (proposal.downsideLossCapUsd > treasuryUsdProxy * env.MAX_RISK_PER_TRADE) {
    return {
      ok: false,
      reason: `downside ${proposal.downsideLossCapUsd} > ${treasuryUsdProxy * env.MAX_RISK_PER_TRADE} cap`,
    };
  }

  // 7. Anti-attack heuristic: refuse anything whose description contains banned terms.
  const banned = [
    "drain",
    "sandwich",
    "front-run user",
    "exploit zero-day",
    "exploit unpatched",
    "private key recovery",
    "approval phish",
  ];
  const text = (proposal.description + " " + JSON.stringify(proposal.payload)).toLowerCase();
  for (const word of banned) {
    if (text.includes(word)) {
      logger.warn({ word, proposal: proposal.description }, "safety: banned phrase in proposal");
      return { ok: false, reason: `banned strategy phrase: ${word}` };
    }
  }

  return { ok: true };
}

/** Returns the maximum value (wei) the executor may spend on this trade. */
export async function maxTradeValueWei(): Promise<bigint> {
  const cap = await treasury.maxTradeSizeWei();
  // Also clamp to a hard ceiling for paranoia (5x ETH_FLOOR equivalent).
  const ceiling = parseEther((env.ETH_FLOOR * 5).toString());
  return cap < ceiling ? cap : ceiling;
}
