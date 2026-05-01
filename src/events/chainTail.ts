import { getProvider } from "../chain/client.js";
import { logger } from "../logger.js";
import type { EventSource, RawEvent } from "./types.js";

/**
 * Reads the latest block and emits a low-priority "chain_block" event.
 * Strategies that need block-by-block detail can subscribe via this source
 * and pull additional data (logs, txs) on demand.
 */
export class ChainTailSource implements EventSource {
  readonly name = "chain-tail";
  private lastBlock = 0;

  async poll(): Promise<RawEvent[]> {
    let blockNumber: number;
    try {
      blockNumber = await getProvider().getBlockNumber();
    } catch (err) {
      logger.debug({ err }, "chain-tail getBlockNumber failed");
      return [];
    }
    if (this.lastBlock === 0) {
      this.lastBlock = blockNumber;
      return [];
    }
    if (blockNumber <= this.lastBlock) return [];
    const from = this.lastBlock + 1;
    this.lastBlock = blockNumber;
    return [
      {
        id: `chain:${blockNumber}`,
        category: "chain_block",
        source: this.name,
        timestamp: new Date().toISOString(),
        payload: { from, to: blockNumber },
        summary: `Base block tail ${from}..${blockNumber}`,
      },
    ];
  }
}
