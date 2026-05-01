import { strategyEnabled } from "../config.js";
import type { RawEvent } from "../events/types.js";
import { logger } from "../logger.js";
import { DistressedAssetStrategy } from "./distressedAsset.js";
import { LiquidationHunterStrategy } from "./liquidationHunter.js";
import { PostExploitArbStrategy } from "./postExploitArb.js";
import type { Strategy, TradeProposal } from "./types.js";

export class StrategyRouter {
  private readonly strategies: Strategy[];

  constructor() {
    const all: Strategy[] = [];
    if (strategyEnabled("postExploit")) all.push(new PostExploitArbStrategy());
    if (strategyEnabled("liquidation")) all.push(new LiquidationHunterStrategy());
    if (strategyEnabled("distressed")) all.push(new DistressedAssetStrategy());
    this.strategies = all;
  }

  async route(event: RawEvent): Promise<TradeProposal[]> {
    const proposals: TradeProposal[] = [];
    for (const s of this.strategies) {
      if (!s.matches(event)) continue;
      try {
        const out = await s.evaluate(event);
        proposals.push(...out);
      } catch (err) {
        logger.warn({ err, strategy: s.key, eventId: event.id }, "strategy evaluate failed");
      }
    }
    return proposals;
  }

  enabledStrategies(): string[] {
    return this.strategies.map((s) => s.key);
  }
}
