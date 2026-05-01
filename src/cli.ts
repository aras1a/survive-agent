import { Agent } from "./agent/agent.js";
import { triage } from "./agent/triage.js";
import { getProvider, getWallet } from "./chain/client.js";
import { env, strategyEnabled } from "./config.js";
import { chat } from "./llm/client.js";
import { logger } from "./logger.js";
import { survival } from "./treasury/survival.js";
import { treasury } from "./treasury/treasury.js";

async function cmdAgent(forceDryRun: boolean): Promise<void> {
  const agent = new Agent({ forceDryRun });
  const handle = (sig: string) => {
    logger.info({ sig }, "shutdown signal");
    agent.stop();
    setTimeout(() => process.exit(0), 250);
  };
  process.on("SIGINT", () => handle("SIGINT"));
  process.on("SIGTERM", () => handle("SIGTERM"));
  await agent.run();
}

async function cmdStatus(): Promise<void> {
  const wallet = getWallet();
  const address = wallet ? await wallet.getAddress() : "(no wallet)";
  const ts = await treasury.snapshot();
  const surv = survival.status();
  let chainBlock = "n/a";
  try {
    chainBlock = String(await getProvider().getBlockNumber());
  } catch {
    // ignore
  }
  console.log(
    JSON.stringify(
      {
        address,
        chainBlock,
        treasury: ts,
        survival: surv,
        live: env.ENABLE_LIVE_TRADING === "true",
        strategies: {
          liquidation: strategyEnabled("liquidation"),
          postExploit: strategyEnabled("postExploit"),
          distressed: strategyEnabled("distressed"),
        },
      },
      null,
      2,
    ),
  );
}

async function cmdEventTest(): Promise<void> {
  const sample = {
    id: "test:exploit:1",
    category: "exploit_alert" as const,
    source: "test",
    timestamp: new Date().toISOString(),
    payload: {
      title: "ProtocolX drained for $50M on Ethereum mainnet",
      link: "https://rekt.news/protocolx-rekt/",
    },
    summary: "[test] ProtocolX drained for $50M on Ethereum mainnet",
  };
  const verdict = await triage(sample);
  console.log(JSON.stringify({ verdict }, null, 2));
}

async function cmdLlmPing(): Promise<void> {
  const resp = await chat(
    [
      { role: "system", content: "You are a one-line health-check responder." },
      { role: "user", content: 'Reply with exactly: {"pong": true}' },
    ],
    { tier: "fast", json: true, maxTokens: 32 },
  );
  console.log(JSON.stringify(resp, null, 2));
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "agent":
      await cmdAgent(rest.includes("--dry-run"));
      break;
    case "status":
      await cmdStatus();
      break;
    case "event-test":
      await cmdEventTest();
      break;
    case "llm-ping":
      await cmdLlmPing();
      break;
    default:
      console.log("Usage: cli.ts <agent|status|event-test|llm-ping> [--dry-run]");
      process.exit(2);
  }
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
