import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  BASE_FORK_RPC_URL: z.string().url().optional(),
  PRIVATE_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "PRIVATE_KEY must be 64 hex chars without 0x prefix")
    .optional(),
  DEADLINE_SWEEP_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "DEADLINE_SWEEP_ADDRESS must be a 0x-prefixed address")
    .optional(),

  MIMO_API_KEY: z.string().optional(),
  MIMO_BASE_URL: z.string().url().default("https://api.xiaomimimo.com/v1"),
  MIMO_FAST_MODEL: z.string().default("mimo-v2.5-flash"),
  MIMO_PRO_MODEL: z.string().default("mimo-v2.5-pro"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),

  SURVIVAL_DEADLINE: z
    .string()
    .default("2026-05-28T23:59:59Z")
    .refine((v) => !Number.isNaN(Date.parse(v)), "SURVIVAL_DEADLINE must be ISO-8601"),
  ETH_FLOOR: z.coerce.number().nonnegative().default(0.001),
  MAX_RISK_PER_TRADE: z.coerce.number().positive().max(1).default(0.1),
  ANTHROPIC_BUDGET_USD: z.coerce.number().nonnegative().default(10),
  MIMO_BUDGET_USD: z.coerce.number().nonnegative().default(100000),

  ENABLE_LIVE_TRADING: z.enum(["true", "false"]).default("false"),
  ENABLE_LIQUIDATION_HUNTER: z.enum(["true", "false"]).default("true"),
  ENABLE_POST_EXPLOIT_ARB: z.enum(["true", "false"]).default("true"),
  ENABLE_DISTRESSED_ASSET: z.enum(["true", "false"]).default("false"),

  FORTA_API_KEY: z.string().optional(),
  REKT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  CHAIN_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(12_000),
  LIQUIDATION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  STATE_DIR: z.string().default("./data"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);

export function isLiveTradingEnabled(): boolean {
  return env.ENABLE_LIVE_TRADING === "true";
}

export function deadlineMs(): number {
  return Date.parse(env.SURVIVAL_DEADLINE);
}

export function strategyEnabled(name: "liquidation" | "postExploit" | "distressed"): boolean {
  switch (name) {
    case "liquidation":
      return env.ENABLE_LIQUIDATION_HUNTER === "true";
    case "postExploit":
      return env.ENABLE_POST_EXPLOIT_ARB === "true";
    case "distressed":
      return env.ENABLE_DISTRESSED_ASSET === "true";
  }
}
