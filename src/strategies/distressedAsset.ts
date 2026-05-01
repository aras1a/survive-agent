import { chatJson } from "../llm/client.js";
import { ANALYSIS_SYSTEM } from "../llm/prompts.js";
import type { RawEvent } from "../events/types.js";
import { logger } from "../logger.js";
import type { Strategy, TradeProposal } from "./types.js";

interface AnalysisResult {
  decision: "skip" | "propose";
  strategy: string;
  confidence: number;
  expected_profit_usd: number;
  downside_loss_cap_usd: number;
  estimated_gas_cost_usd: number;
  rationale: string;
  execution_steps: string[];
}

/**
 * After a reported social/exploit event, sometimes a token sells off way past
 * its fundamental impact. This strategy uses MIMO Pro to evaluate whether
 * a small contrarian buy (within risk caps) is justified.
 *
 * Disabled by default (ENABLE_DISTRESSED_ASSET=false). Enable only after
 * dry-running and trusting the LLM's calibration.
 */
export class DistressedAssetStrategy implements Strategy {
  readonly key = "distressed_asset" as const;

  matches(event: RawEvent): boolean {
    return event.category === "exploit_alert" || event.category === "social_signal";
  }

  async evaluate(event: RawEvent): Promise<TradeProposal[]> {
    const summary = event.summary ?? JSON.stringify(event.payload).slice(0, 500);
    let analysis: AnalysisResult;
    try {
      const { data } = await chatJson<AnalysisResult>(
        [
          { role: "system", content: ANALYSIS_SYSTEM },
          {
            role: "user",
            content:
              `Event: ${summary}\n\n` +
              `You are evaluating a contrarian "buy the panic" entry on a Base-deployed token.\n` +
              `Hard constraints: max position size = 10% of treasury, must use limit-style swap with slippage cap.\n` +
              `If the token is not on Base or you can't identify the token, return decision="skip".`,
          },
        ],
        { tier: "pro", tag: "distressed-asset-analysis", maxTokens: 1024 },
      );
      analysis = data;
    } catch (err) {
      logger.warn({ err, eventId: event.id }, "distressed-asset analysis failed");
      return [];
    }
    if (analysis.decision !== "propose") return [];
    return [
      {
        strategy: this.key,
        description: analysis.rationale,
        expectedProfitUsd: Number(analysis.expected_profit_usd) || 0,
        downsideLossCapUsd: Number(analysis.downside_loss_cap_usd) || 0,
        estimatedGasCostUsd: Number(analysis.estimated_gas_cost_usd) || 0,
        requiresEscalation: true,
        source: event.id,
        payload: {
          rationale: analysis.rationale,
          steps: analysis.execution_steps,
          confidence: analysis.confidence,
        },
      },
    ];
  }
}
