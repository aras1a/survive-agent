import { formatEther, parseEther } from "ethers";
import { getProvider, getWallet } from "../chain/client.js";
import { env } from "../config.js";
import { logger } from "../logger.js";
import { llmBudget } from "../llm/budget.js";
import { StateStore } from "../utils/state.js";

interface TreasuryState extends Record<string, unknown> {
  /** Highest ETH balance ever observed in this treasury (for drawdown tracking) */
  highWaterMarkWei: string;
  /** Manual circuit-breaker - flips to true if a kill condition fires */
  halted: boolean;
  haltReason?: string;
}

const DEFAULT: TreasuryState = { highWaterMarkWei: "0", halted: false };
const store = new StateStore<TreasuryState>("treasury", DEFAULT);

export interface TreasurySnapshot {
  ethBalance: string;
  ethFloor: string;
  ethBalanceUsd: number | null;
  halted: boolean;
  haltReason?: string;
  llmCostUsd: { mimo: number; anthropic: number };
  highWaterMarkEth: string;
  drawdownPct: number;
}

export class Treasury {
  /** Returns null if the wallet is not configured. */
  async ethBalance(): Promise<bigint | null> {
    const wallet = getWallet();
    if (!wallet) return null;
    return await getProvider().getBalance(await wallet.getAddress());
  }

  async snapshot(ethUsdPrice?: number): Promise<TreasurySnapshot> {
    const balance = (await this.ethBalance()) ?? 0n;
    const state = await store.update((data) => {
      const hwm = BigInt(data.highWaterMarkWei || "0");
      if (balance > hwm) data.highWaterMarkWei = balance.toString();
    });
    const hwm = BigInt(state.highWaterMarkWei || "0");
    const drawdownPct = hwm === 0n ? 0 : Number((hwm - balance) * 10_000n / hwm) / 100;
    const budget = await llmBudget.snapshot();
    return {
      ethBalance: formatEther(balance),
      ethFloor: env.ETH_FLOOR.toString(),
      ethBalanceUsd: ethUsdPrice ? Number(formatEther(balance)) * ethUsdPrice : null,
      halted: state.halted,
      haltReason: state.haltReason,
      llmCostUsd: budget.totalUsd,
      highWaterMarkEth: formatEther(hwm),
      drawdownPct,
    };
  }

  async isAboveFloor(): Promise<boolean> {
    const balance = (await this.ethBalance()) ?? 0n;
    return balance >= parseEther(env.ETH_FLOOR.toString());
  }

  async halt(reason: string): Promise<void> {
    logger.warn({ reason }, "treasury HALT");
    await store.update((data) => {
      data.halted = true;
      data.haltReason = reason;
    });
  }

  async resume(): Promise<void> {
    await store.update((data) => {
      data.halted = false;
      data.haltReason = undefined;
    });
  }

  async isHalted(): Promise<boolean> {
    return (await store.load()).halted;
  }

  /**
   * Maximum trade-size in wei based on MAX_RISK_PER_TRADE * current balance.
   */
  async maxTradeSizeWei(): Promise<bigint> {
    const balance = (await this.ethBalance()) ?? 0n;
    const factorBps = BigInt(Math.round(env.MAX_RISK_PER_TRADE * 10_000));
    return (balance * factorBps) / 10_000n;
  }
}

export const treasury = new Treasury();
