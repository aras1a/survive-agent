/**
 * Published per-million-token pricing.
 * Sources:
 *  - MIMO: https://www.mimo-v2.com/docs/pricing
 *  - Anthropic: https://www.anthropic.com/pricing
 *
 * These are heuristic; the actual billing comes from the provider.
 * We use them only to estimate cost for budget gating.
 */
export const PRICING = {
  mimo: {
    flash: { inputPerMTok: 0.11, outputPerMTok: 0.32 },
    pro: { inputPerMTok: 1.05, outputPerMTok: 3.15 },
  },
  anthropic: {
    // claude-haiku-4-5 indicative pricing
    default: { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  },
} as const;

export function estimateCostUsd(
  provider: "mimo-flash" | "mimo-pro" | "anthropic",
  inputTokens: number,
  outputTokens: number,
): number {
  const t = (n: number) => n / 1_000_000;
  switch (provider) {
    case "mimo-flash":
      return t(inputTokens) * PRICING.mimo.flash.inputPerMTok + t(outputTokens) * PRICING.mimo.flash.outputPerMTok;
    case "mimo-pro":
      return t(inputTokens) * PRICING.mimo.pro.inputPerMTok + t(outputTokens) * PRICING.mimo.pro.outputPerMTok;
    case "anthropic":
      return t(inputTokens) * PRICING.anthropic.default.inputPerMTok + t(outputTokens) * PRICING.anthropic.default.outputPerMTok;
  }
}
