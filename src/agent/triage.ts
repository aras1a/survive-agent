import { chatJson } from "../llm/client.js";
import { TRIAGE_SYSTEM } from "../llm/prompts.js";
import type { RawEvent } from "../events/types.js";
import { logger } from "../logger.js";

export interface TriageVerdict {
  interesting: boolean;
  category: "post_exploit_arb" | "liquidation" | "distressed_asset" | "ignore";
  confidence: number;
  reason: string;
  needs_pro_analysis: boolean;
}

/**
 * Cheap classifier using MIMO V2.5 Flash. Decides whether to drop the event
 * or push it to the strategy router (which may invoke MIMO Pro / Anthropic).
 */
export async function triage(event: RawEvent): Promise<TriageVerdict> {
  const summary = event.summary ?? JSON.stringify(event.payload).slice(0, 400);
  try {
    const { data } = await chatJson<TriageVerdict>(
      [
        { role: "system", content: TRIAGE_SYSTEM },
        {
          role: "user",
          content:
            `Event source: ${event.source}\n` +
            `Event category: ${event.category}\n` +
            `Event timestamp: ${event.timestamp}\n` +
            `Summary: ${summary}`,
        },
      ],
      { tier: "fast", tag: "triage", maxTokens: 256 },
    );
    return data;
  } catch (err) {
    logger.debug({ err, eventId: event.id }, "triage LLM failed, falling back to ignore");
    return {
      interesting: false,
      category: "ignore",
      confidence: 0,
      reason: `triage error: ${(err as Error).message}`,
      needs_pro_analysis: false,
    };
  }
}
