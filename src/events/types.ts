export type EventCategory =
  | "exploit_alert"
  | "liquidation_candidate"
  | "price_anomaly"
  | "social_signal"
  | "chain_block";

export interface RawEvent {
  /** Stable ID - used for de-duplication. */
  id: string;
  category: EventCategory;
  source: string;
  timestamp: string;
  /** Free-form payload - downstream LLM/strategy will parse. */
  payload: Record<string, unknown>;
  /** Optional summary fed to the LLM triage step. */
  summary?: string;
}

export interface EventSource {
  readonly name: string;
  /** Returns events newer than the previous poll. Should be idempotent. */
  poll(): Promise<RawEvent[]>;
  /** Optional cleanup. */
  close?(): Promise<void> | void;
}
