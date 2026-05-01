import { env, isLiveTradingEnabled } from "../config.js";
import { EventManager } from "../events/manager.js";
import type { RawEvent } from "../events/types.js";
import { executor } from "../executor/executor.js";
import { logger } from "../logger.js";
import { StrategyRouter } from "../strategies/router.js";
import { survival } from "../treasury/survival.js";
import { treasury } from "../treasury/treasury.js";
import { sleep } from "../utils/time.js";
import { triage } from "./triage.js";

export interface AgentOptions {
  /** Override LIVE flag (e.g. CLI --dry-run forces dry-run). */
  forceDryRun?: boolean;
}

export class Agent {
  private readonly events = new EventManager();
  private readonly strategies = new StrategyRouter();
  private readonly opts: AgentOptions;
  private stopped = false;

  constructor(opts: AgentOptions = {}) {
    this.opts = opts;
  }

  async run(): Promise<void> {
    const live = isLiveTradingEnabled() && !this.opts.forceDryRun;
    logger.info(
      {
        live,
        deadline: env.SURVIVAL_DEADLINE,
        strategies: this.strategies.enabledStrategies(),
      },
      "agent starting",
    );

    // Initial enforcement pass.
    await survival.enforceDeadline();
    await survival.enforceFloor();

    while (!this.stopped) {
      try {
        await this.cycle();
      } catch (err) {
        logger.error({ err }, "agent cycle failed");
      }
      await sleep(env.CHAIN_POLL_INTERVAL_MS);
    }
  }

  async cycle(): Promise<void> {
    await survival.enforceDeadline();
    await survival.enforceFloor();
    if (await treasury.isHalted()) {
      logger.debug("agent halted - cycle skipped");
      return;
    }
    await this.events.runOnce(async (ev) => this.handleEvent(ev));
  }

  async handleEvent(event: RawEvent): Promise<void> {
    const verdict = await triage(event);
    if (!verdict.interesting || verdict.category === "ignore") {
      logger.debug({ eventId: event.id, verdict }, "triage: ignored");
      return;
    }
    logger.info({ eventId: event.id, verdict }, "triage: interesting");
    const proposals = await this.strategies.route(event);
    if (proposals.length === 0) {
      logger.info({ eventId: event.id }, "no proposals from strategies");
      return;
    }
    for (const p of proposals) {
      try {
        const res = await executor.run(p);
        logger.info({ res }, "proposal handled");
      } catch (err) {
        logger.error({ err, proposal: p.description }, "proposal execution error");
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.events.stop();
  }
}
