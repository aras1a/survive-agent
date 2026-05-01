import { logger } from "../logger.js";
import type { TradeProposal } from "../strategies/types.js";
import { StateStore } from "../utils/state.js";
import { checkSafety } from "./safety.js";
import { chatJson } from "../llm/client.js";
import { ESCALATION_SYSTEM } from "../llm/prompts.js";
import { isLiveTradingEnabled } from "../config.js";

interface ExecutionState extends Record<string, unknown> {
  attempts: ExecutionAttempt[];
}

interface ExecutionAttempt {
  ts: string;
  strategy: string;
  description: string;
  decision: "skipped" | "dry-run" | "escalation-rejected" | "broadcast" | "error";
  reason: string;
  expectedProfitUsd: number;
  source: string;
}

const store = new StateStore<ExecutionState>("execution-log", { attempts: [] });

interface EscalationVerdict {
  approved: boolean;
  reason: string;
  additional_checks: string[];
}

export class Executor {
  async run(proposal: TradeProposal): Promise<ExecutionAttempt> {
    const safety = await checkSafety(proposal);
    if (!safety.ok) {
      const attempt: ExecutionAttempt = {
        ts: new Date().toISOString(),
        strategy: proposal.strategy,
        description: proposal.description,
        decision: isLiveTradingEnabled() ? "skipped" : "dry-run",
        reason: safety.reason ?? "unknown",
        expectedProfitUsd: proposal.expectedProfitUsd,
        source: proposal.source,
      };
      await this.persist(attempt);
      return attempt;
    }

    if (proposal.requiresEscalation) {
      let verdict: EscalationVerdict;
      try {
        const { data } = await chatJson<EscalationVerdict>(
          [
            { role: "system", content: ESCALATION_SYSTEM },
            {
              role: "user",
              content:
                `Strategy: ${proposal.strategy}\n` +
                `Description: ${proposal.description}\n` +
                `Expected profit USD: ${proposal.expectedProfitUsd}\n` +
                `Downside loss cap USD: ${proposal.downsideLossCapUsd}\n` +
                `Estimated gas USD: ${proposal.estimatedGasCostUsd}\n` +
                `Source: ${proposal.source}\n` +
                `Payload: ${JSON.stringify(proposal.payload).slice(0, 1000)}\n`,
            },
          ],
          { tier: "escalate", tag: "exec-escalation", maxTokens: 512 },
        );
        verdict = data;
      } catch (err) {
        const attempt: ExecutionAttempt = {
          ts: new Date().toISOString(),
          strategy: proposal.strategy,
          description: proposal.description,
          decision: "error",
          reason: `escalation LLM error: ${(err as Error).message}`,
          expectedProfitUsd: proposal.expectedProfitUsd,
          source: proposal.source,
        };
        await this.persist(attempt);
        return attempt;
      }
      if (!verdict.approved) {
        const attempt: ExecutionAttempt = {
          ts: new Date().toISOString(),
          strategy: proposal.strategy,
          description: proposal.description,
          decision: "escalation-rejected",
          reason: verdict.reason,
          expectedProfitUsd: proposal.expectedProfitUsd,
          source: proposal.source,
        };
        await this.persist(attempt);
        return attempt;
      }
    }

    // Real broadcasting is intentionally NOT implemented in this version.
    // We log a "broadcast" attempt only in live mode; otherwise it is a dry-run.
    // Future work: build a Universal Router / direct-quote swap path tied to
    // the proposal's payload. For safety we keep this as a placeholder until
    // a per-strategy adapter is added with explicit unit tests.
    const attempt: ExecutionAttempt = {
      ts: new Date().toISOString(),
      strategy: proposal.strategy,
      description: proposal.description,
      decision: isLiveTradingEnabled() ? "broadcast" : "dry-run",
      reason: isLiveTradingEnabled()
        ? "live broadcasting adapter not yet implemented; refusing real-money tx"
        : "dry-run mode",
      expectedProfitUsd: proposal.expectedProfitUsd,
      source: proposal.source,
    };
    if (attempt.decision === "broadcast") {
      logger.warn(
        { proposal },
        "live mode requested but per-strategy broadcast adapter is not implemented; tx skipped",
      );
      attempt.decision = "skipped";
    }
    await this.persist(attempt);
    return attempt;
  }

  private async persist(attempt: ExecutionAttempt): Promise<void> {
    logger.info({ attempt }, "execution attempt recorded");
    await store.update((data) => {
      data.attempts.push(attempt);
      if (data.attempts.length > 5_000) data.attempts = data.attempts.slice(-5_000);
    });
  }
}

export const executor = new Executor();
