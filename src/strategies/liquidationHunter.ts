import { Contract, formatUnits } from "ethers";
import { AAVE_V3_POOL_ABI } from "../chain/abis.js";
import { AAVE_V3_BASE } from "../chain/addresses.js";
import { getProvider } from "../chain/client.js";
import type { RawEvent } from "../events/types.js";
import { logger } from "../logger.js";
import type { Strategy, TradeProposal } from "./types.js";

const HEALTH_FACTOR_THRESHOLD = 1n; // 1.0 in 1e18

/**
 * Reads Aave V3 user account data to find positions whose health factor < 1.0.
 *
 * NOTE: Aave does not expose a "give me liquidatable users" RPC. To find
 * candidates we'd need an indexer (Aave subgraph) or to listen to Borrow
 * events and track health offline. For the MVP, this strategy accepts a
 * candidate-user list passed in via event.payload.candidates and validates
 * each on-chain.
 *
 * In production you'd plug this into a subgraph poller event source.
 */
export class LiquidationHunterStrategy implements Strategy {
  readonly key = "liquidation" as const;

  matches(event: RawEvent): boolean {
    return event.category === "liquidation_candidate";
  }

  async evaluate(event: RawEvent): Promise<TradeProposal[]> {
    const candidates = (event.payload.candidates as string[] | undefined) ?? [];
    if (candidates.length === 0) return [];

    const pool = new Contract(AAVE_V3_BASE.POOL, AAVE_V3_POOL_ABI, getProvider()) as unknown as {
      getUserAccountData: (user: string) => Promise<[bigint, bigint, bigint, bigint, bigint, bigint]>;
    };
    const proposals: TradeProposal[] = [];

    for (const user of candidates) {
      let data: {
        totalCollateralBase: bigint;
        totalDebtBase: bigint;
        availableBorrowsBase: bigint;
        currentLiquidationThreshold: bigint;
        ltv: bigint;
        healthFactor: bigint;
      };
      try {
        const r = await pool.getUserAccountData(user);
        data = {
          totalCollateralBase: r[0],
          totalDebtBase: r[1],
          availableBorrowsBase: r[2],
          currentLiquidationThreshold: r[3],
          ltv: r[4],
          healthFactor: r[5],
        };
      } catch (err) {
        logger.debug({ err, user }, "Aave getUserAccountData failed");
        continue;
      }

      // healthFactor is in 1e18. <1.0 => liquidatable.
      const hfThresholdRaw = HEALTH_FACTOR_THRESHOLD * 10n ** 18n;
      if (data.healthFactor === 0n || data.healthFactor >= hfThresholdRaw) continue;

      // Aave returns Base-currency values in 1e8 (USD). Approximate USD value.
      const totalDebtUsd = Number(formatUnits(data.totalDebtBase, 8));
      const collUsd = Number(formatUnits(data.totalCollateralBase, 8));
      // Per Aave V3, max liquidation = 50% of debt. Bonus ~5% on Base assets.
      // We further halve our claim to be conservative for downstream sizing.
      const maxClaimDebtUsd = totalDebtUsd * 0.5;
      const expectedBonusUsd = maxClaimDebtUsd * 0.025;

      proposals.push({
        strategy: this.key,
        description: `Aave V3 liquidatable user ${user} | HF=${formatUnits(
          data.healthFactor,
          18,
        )} | debt=$${totalDebtUsd.toFixed(2)} | coll=$${collUsd.toFixed(2)}`,
        expectedProfitUsd: expectedBonusUsd,
        downsideLossCapUsd: maxClaimDebtUsd * 0.01, // 1% slippage cushion
        estimatedGasCostUsd: 1.5, // Base liquidation cost ballpark
        requiresEscalation: true,
        source: event.id,
        payload: {
          user,
          totalDebtUsd,
          totalCollateralUsd: collUsd,
          healthFactor: formatUnits(data.healthFactor, 18),
        },
      });
    }
    return proposals;
  }
}
