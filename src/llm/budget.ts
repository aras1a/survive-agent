import { env } from "../config.js";
import { logger } from "../logger.js";
import { StateStore } from "../utils/state.js";
import type { LLMUsageRecord } from "./types.js";

interface BudgetState extends Record<string, unknown> {
  records: LLMUsageRecord[];
  totalUsd: { mimo: number; anthropic: number };
}

const DEFAULT_STATE: BudgetState = {
  records: [],
  totalUsd: { mimo: 0, anthropic: 0 },
};

const MAX_RECORDS = 5_000;

const store = new StateStore<BudgetState>("llm-budget", DEFAULT_STATE);

export class LLMBudget {
  async record(rec: LLMUsageRecord): Promise<void> {
    await store.update((data) => {
      data.records.push(rec);
      if (data.records.length > MAX_RECORDS) {
        data.records = data.records.slice(-MAX_RECORDS);
      }
      if (rec.provider === "anthropic") {
        data.totalUsd.anthropic += rec.costUsd;
      } else {
        data.totalUsd.mimo += rec.costUsd;
      }
    });
  }

  async snapshot(): Promise<BudgetState> {
    return await store.load();
  }

  async assertWithinBudget(provider: "mimo" | "anthropic", projectedCost: number): Promise<void> {
    const data = await store.load();
    const cap = provider === "anthropic" ? env.ANTHROPIC_BUDGET_USD : env.MIMO_BUDGET_USD;
    const used = data.totalUsd[provider];
    if (used + projectedCost > cap) {
      logger.warn(
        { provider, used, projectedCost, cap },
        "LLM budget would be exceeded - blocking call",
      );
      throw new BudgetExceededError(provider, used, cap);
    }
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public provider: string,
    public used: number,
    public cap: number,
  ) {
    super(`LLM budget exceeded for ${provider}: $${used.toFixed(4)} / $${cap}`);
    this.name = "BudgetExceededError";
  }
}

export const llmBudget = new LLMBudget();
