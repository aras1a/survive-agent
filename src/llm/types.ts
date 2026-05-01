export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequestOptions {
  /** "fast" -> MIMO V2.5 Flash; "pro" -> MIMO V2.5 Pro; "escalate" -> Anthropic */
  tier?: "fast" | "pro" | "escalate";
  maxTokens?: number;
  temperature?: number;
  /** Free-form tag for cost analytics */
  tag?: string;
  /** If true, response is parsed as JSON. Throws on parse failure. */
  json?: boolean;
}

export interface LLMResponse {
  text: string;
  /** Provider tag (mimo-fast, mimo-pro, anthropic). */
  provider: string;
  /** Model identifier reported by provider. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost based on published per-MTok pricing. */
  costUsd: number;
  /** Wall-clock latency in ms. */
  latencyMs: number;
}

export interface LLMUsageRecord {
  ts: string;
  tier: string;
  provider: string;
  model: string;
  tag?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
