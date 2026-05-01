import { formatEther } from "ethers";
import { getProvider, getWallet } from "../chain/client.js";
import { deadlineMs, env, isLiveTradingEnabled } from "../config.js";
import { logger } from "../logger.js";
import { humanizeMs } from "../utils/time.js";
import { treasury } from "./treasury.js";

export interface SurvivalStatus {
  deadlineIso: string;
  msUntilDeadline: number;
  human: string;
  daysRemaining: number;
  pastDeadline: boolean;
}

export class SurvivalManager {
  status(): SurvivalStatus {
    const ms = deadlineMs() - Date.now();
    return {
      deadlineIso: env.SURVIVAL_DEADLINE,
      msUntilDeadline: ms,
      human: humanizeMs(ms),
      daysRemaining: Math.max(0, Math.ceil(ms / 86_400_000)),
      pastDeadline: ms <= 0,
    };
  }

  /**
   * If past deadline, halt the treasury and (when live + sweep address present)
   * send all remaining ETH to the sweep address.
   */
  async enforceDeadline(): Promise<void> {
    const s = this.status();
    if (!s.pastDeadline) return;
    if (await treasury.isHalted()) return;
    await treasury.halt("deadline reached");
    if (!isLiveTradingEnabled()) {
      logger.info("Past deadline; live trading disabled, no sweep performed.");
      return;
    }
    const wallet = getWallet();
    if (!wallet) {
      logger.warn("Past deadline; no wallet configured, cannot sweep.");
      return;
    }
    if (!env.DEADLINE_SWEEP_ADDRESS) {
      logger.warn("Past deadline; DEADLINE_SWEEP_ADDRESS not set, cannot sweep.");
      return;
    }
    try {
      const balance = await getProvider().getBalance(await wallet.getAddress());
      const feeData = await getProvider().getFeeData();
      const gasLimit = 21_000n;
      const maxFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 1n;
      const reserve = gasLimit * maxFee * 2n; // generous buffer
      if (balance <= reserve) {
        logger.warn({ balance: formatEther(balance) }, "Past deadline; balance below gas reserve, nothing to sweep.");
        return;
      }
      const value = balance - reserve;
      logger.info(
        { to: env.DEADLINE_SWEEP_ADDRESS, value: formatEther(value) },
        "deadline sweep: sending residual ETH",
      );
      const tx = await wallet.sendTransaction({
        to: env.DEADLINE_SWEEP_ADDRESS,
        value,
      });
      await tx.wait();
      logger.info({ hash: tx.hash }, "deadline sweep complete");
    } catch (err) {
      logger.error({ err }, "deadline sweep failed");
    }
  }

  /** Hard floor check - halts if balance < floor. */
  async enforceFloor(): Promise<void> {
    if (await treasury.isHalted()) return;
    if (!(await treasury.isAboveFloor())) {
      await treasury.halt(`balance below floor (${env.ETH_FLOOR} ETH)`);
    }
  }
}

export const survival = new SurvivalManager();
