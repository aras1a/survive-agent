import { env } from "../config.js";
import { logger } from "../logger.js";
import type { EventSource, RawEvent } from "./types.js";

const FORTA_GQL = "https://api.forta.network/graphql";
const BASE_CHAIN_ID = 8453;

interface FortaAlert {
  hash: string;
  name: string;
  description: string;
  severity: string;
  source: { transactionHash?: string; bot?: { id: string; name: string } };
  createdAt: string;
}

const QUERY = `
query Alerts($chainId: Int!) {
  alerts(input: { chainId: $chainId, first: 25, severities: [HIGH, CRITICAL] }) {
    alerts {
      hash
      name
      description
      severity
      source { transactionHash bot { id name } }
      createdAt
    }
  }
}
`;

export class FortaSource implements EventSource {
  readonly name = "forta";
  private seen = new Set<string>();

  async poll(): Promise<RawEvent[]> {
    if (!env.FORTA_API_KEY) return [];
    let body: { data?: { alerts?: { alerts?: FortaAlert[] } } };
    try {
      const res = await fetch(FORTA_GQL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.FORTA_API_KEY}`,
        },
        body: JSON.stringify({ query: QUERY, variables: { chainId: BASE_CHAIN_ID } }),
      });
      if (!res.ok) {
        logger.debug({ status: res.status }, "forta non-OK");
        return [];
      }
      body = (await res.json()) as { data?: { alerts?: { alerts?: FortaAlert[] } } };
    } catch (err) {
      logger.debug({ err }, "forta fetch failed");
      return [];
    }
    const alerts = body.data?.alerts?.alerts ?? [];
    const fresh: RawEvent[] = [];
    for (const a of alerts) {
      if (this.seen.has(a.hash)) continue;
      this.seen.add(a.hash);
      fresh.push({
        id: `forta:${a.hash}`,
        category: "exploit_alert",
        source: this.name,
        timestamp: a.createdAt,
        payload: { ...a },
        summary: `[forta:${a.severity}] ${a.name} | ${a.description.slice(0, 200)}`,
      });
    }
    if (this.seen.size > 2_000) {
      const arr = Array.from(this.seen);
      this.seen = new Set(arr.slice(-1_000));
    }
    return fresh;
  }
}
