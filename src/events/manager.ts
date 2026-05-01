import { logger } from "../logger.js";
import { sleep } from "../utils/time.js";
import { AaveSubgraphSource } from "./aaveSubgraph.js";
import { ChainTailSource } from "./chainTail.js";
import { FortaSource } from "./forta.js";
import { PriceAnomalySource } from "./priceAnomaly.js";
import { RektNewsSource } from "./rektNews.js";
import type { EventSource, RawEvent } from "./types.js";

export interface EventManagerOptions {
  pollIntervalMs: number;
  onEvent: (ev: RawEvent) => Promise<void> | void;
}

export class EventManager {
  private readonly sources: EventSource[];
  private stopped = false;

  constructor(sources?: EventSource[]) {
    this.sources = sources ?? [
      new RektNewsSource(),
      new FortaSource(),
      new PriceAnomalySource(),
      new AaveSubgraphSource(),
      new ChainTailSource(),
    ];
  }

  async runOnce(onEvent: (ev: RawEvent) => Promise<void> | void): Promise<number> {
    let count = 0;
    for (const src of this.sources) {
      try {
        const events = await src.poll();
        for (const ev of events) {
          count += 1;
          await onEvent(ev);
        }
      } catch (err) {
        logger.warn({ err, source: src.name }, "event source poll error");
      }
    }
    return count;
  }

  async runLoop(opts: EventManagerOptions): Promise<void> {
    while (!this.stopped) {
      await this.runOnce(opts.onEvent);
      await sleep(opts.pollIntervalMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
