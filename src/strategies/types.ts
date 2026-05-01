import type { RawEvent } from "../events/types.js";

export type StrategyKey = "post_exploit_arb" | "liquidation" | "distressed_asset";

export interface TradeProposal {
  strategy: StrategyKey;
  description: string;
  /** Quote-token (USD) magnitudes */
  expectedProfitUsd: number;
  downsideLossCapUsd: number;
  estimatedGasCostUsd: number;
  /** True if proposal is safe to dry-run (always) but unsafe to broadcast without further checks */
  requiresEscalation: boolean;
  /** Provider tag for analytics */
  source: string;
  /** Free-form data the executor will consume */
  payload: Record<string, unknown>;
}

export interface Strategy {
  readonly key: StrategyKey;
  /** Tells the router whether this event is plausibly relevant to the strategy. Cheap. */
  matches(event: RawEvent): boolean;
  /** Returns one or more proposals if there is a real opportunity. */
  evaluate(event: RawEvent): Promise<TradeProposal[]>;
}
