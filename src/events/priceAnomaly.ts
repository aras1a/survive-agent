import { Contract } from "ethers";
import { UNIV2_PAIR_ABI } from "../chain/abis.js";
import { BASE_TOKENS } from "../chain/addresses.js";
import { getProvider } from "../chain/client.js";
import { logger } from "../logger.js";
import type { EventSource, RawEvent } from "./types.js";

interface WatchedPool {
  label: string;
  address: string;
  /** True if token0 is WETH; affects how we compute the WETH price. */
  wethIsToken0: boolean;
}

/**
 * Curated set of high-volume Base UniV2-compatible pools.
 * Addresses verified against Aerodrome's documented pools and Uniswap V2 Base.
 */
const POOLS: WatchedPool[] = [
  // Aerodrome WETH-USDC volatile pool
  {
    label: "AERO:WETH-USDC",
    address: "0xcDAC0d6c6C59727a65F871236188350531885C43",
    wethIsToken0: true,
  },
];

interface PoolMemory {
  lastPrice?: number;
}

/**
 * Polls a small set of pools and emits a "price_anomaly" event whenever the
 * WETH spot price (in USDC) moves more than `threshold` percent vs the last
 * observation. This is a coarse proxy for "something just happened" (whale
 * dump, exploit drain, depeg) that downstream LLM triage can investigate.
 */
export class PriceAnomalySource implements EventSource {
  readonly name = "price-anomaly";
  private memory = new Map<string, PoolMemory>();

  constructor(private readonly thresholdPct = 1.0) {}

  async poll(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    const provider = getProvider();
    for (const pool of POOLS) {
      let price: number;
      try {
        const c = new Contract(pool.address, UNIV2_PAIR_ABI, provider) as unknown as {
          getReserves: () => Promise<[bigint, bigint, number]>;
        };
        const [r0, r1] = await c.getReserves();
        // WETH 18 decimals, USDC 6 decimals.
        const wethReserve = pool.wethIsToken0 ? r0 : r1;
        const usdcReserve = pool.wethIsToken0 ? r1 : r0;
        if (wethReserve === 0n) continue;
        // price USDC/WETH = (usdcReserve / 10^6) / (wethReserve / 10^18)
        price = (Number(usdcReserve) / 1e6) / (Number(wethReserve) / 1e18);
      } catch (err) {
        logger.debug({ err, pool: pool.label }, "price-anomaly read failed");
        continue;
      }
      const mem = this.memory.get(pool.address) ?? {};
      const last = mem.lastPrice;
      mem.lastPrice = price;
      this.memory.set(pool.address, mem);
      if (last === undefined) continue;
      const movePct = ((price - last) / last) * 100;
      if (Math.abs(movePct) >= this.thresholdPct) {
        events.push({
          id: `price-anomaly:${pool.address}:${Date.now()}`,
          category: "price_anomaly",
          source: this.name,
          timestamp: new Date().toISOString(),
          payload: {
            pool: pool.address,
            label: pool.label,
            previousPriceUsdc: last,
            currentPriceUsdc: price,
            movePct,
            tokens: { weth: BASE_TOKENS.WETH, usdc: BASE_TOKENS.USDC },
          },
          summary: `[price-anomaly] ${pool.label} moved ${movePct.toFixed(2)}% (${last.toFixed(2)} -> ${price.toFixed(2)} USDC/ETH)`,
        });
      }
    }
    return events;
  }
}
