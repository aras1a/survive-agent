import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages.mjs";
import OpenAI from "openai";
import { env } from "../config.js";
import { logger } from "../logger.js";
import { llmBudget } from "./budget.js";
import { estimateCostUsd } from "./pricing.js";
import type { LLMMessage, LLMRequestOptions, LLMResponse } from "./types.js";

let mimoSingleton: OpenAI | null = null;
let anthropicSingleton: Anthropic | null = null;

function mimoClient(): OpenAI {
  if (!env.MIMO_API_KEY) {
    throw new Error("MIMO_API_KEY not configured");
  }
  if (!mimoSingleton) {
    mimoSingleton = new OpenAI({ apiKey: env.MIMO_API_KEY, baseURL: env.MIMO_BASE_URL });
  }
  return mimoSingleton;
}

function anthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  if (!anthropicSingleton) {
    anthropicSingleton = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicSingleton;
}

function splitSystem(messages: LLMMessage[]): { system: string; user: LLMMessage[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const user = messages.filter((m) => m.role !== "system");
  return { system, user };
}

async function callMimo(
  modelTier: "fast" | "pro",
  messages: LLMMessage[],
  opts: LLMRequestOptions,
): Promise<LLMResponse> {
  const model = modelTier === "fast" ? env.MIMO_FAST_MODEL : env.MIMO_PRO_MODEL;
  const provider = modelTier === "fast" ? "mimo-flash" : "mimo-pro";
  const client = mimoClient();
  const start = Date.now();
  const completion = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_completion_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.6,
    response_format: opts.json ? { type: "json_object" } : undefined,
  });
  const latencyMs = Date.now() - start;
  const text = completion.choices[0]?.message?.content ?? "";
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = estimateCostUsd(provider, inputTokens, outputTokens);
  return { text, provider, model, inputTokens, outputTokens, costUsd, latencyMs };
}

async function callAnthropic(messages: LLMMessage[], opts: LLMRequestOptions): Promise<LLMResponse> {
  const client = anthropicClient();
  const { system, user } = splitSystem(messages);
  const start = Date.now();
  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.6,
    system: system || undefined,
    messages: user.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });
  const latencyMs = Date.now() - start;
  const text = message.content
    .map((block: ContentBlock) => (block.type === "text" ? block.text : ""))
    .join("");
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costUsd = estimateCostUsd("anthropic", inputTokens, outputTokens);
  return { text, provider: "anthropic", model: env.ANTHROPIC_MODEL, inputTokens, outputTokens, costUsd, latencyMs };
}

/**
 * High-level LLM call with provider routing and budget guard.
 * Tier semantics:
 *   - "fast"     -> MIMO V2.5 Flash (default for triage/cheap classification)
 *   - "pro"      -> MIMO V2.5 Pro (deeper reasoning, opportunity analysis)
 *   - "escalate" -> Anthropic (last-resort confirmation for live execution)
 */
export async function chat(messages: LLMMessage[], opts: LLMRequestOptions = {}): Promise<LLMResponse> {
  const tier = opts.tier ?? "fast";

  if (tier === "escalate") {
    if (!env.ANTHROPIC_API_KEY) {
      logger.warn("ANTHROPIC_API_KEY missing - escalation falling back to MIMO Pro");
      return chat(messages, { ...opts, tier: "pro" });
    }
    // Pre-budget check using a worst-case estimate (input full, output max).
    const projected = estimateCostUsd(
      "anthropic",
      messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0),
      opts.maxTokens ?? 1024,
    );
    await llmBudget.assertWithinBudget("anthropic", projected);
    const resp = await callAnthropic(messages, opts);
    await llmBudget.record({
      ts: new Date().toISOString(),
      tier,
      provider: resp.provider,
      model: resp.model,
      tag: opts.tag,
      inputTokens: resp.inputTokens,
      outputTokens: resp.outputTokens,
      costUsd: resp.costUsd,
    });
    return resp;
  }

  if (!env.MIMO_API_KEY) {
    if (env.ANTHROPIC_API_KEY) {
      logger.warn("MIMO_API_KEY missing - falling back to Anthropic for tier=" + tier);
      return chat(messages, { ...opts, tier: "escalate" });
    }
    throw new Error("No LLM provider configured (MIMO_API_KEY or ANTHROPIC_API_KEY)");
  }

  const projected = estimateCostUsd(
    tier === "pro" ? "mimo-pro" : "mimo-flash",
    messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0),
    opts.maxTokens ?? 1024,
  );
  await llmBudget.assertWithinBudget("mimo", projected);
  const resp = await callMimo(tier, messages, opts);
  await llmBudget.record({
    ts: new Date().toISOString(),
    tier,
    provider: resp.provider,
    model: resp.model,
    tag: opts.tag,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    costUsd: resp.costUsd,
  });
  return resp;
}

export async function chatJson<T>(messages: LLMMessage[], opts: LLMRequestOptions = {}): Promise<{ data: T; raw: LLMResponse }> {
  const raw = await chat(messages, { ...opts, json: true });
  try {
    return { data: JSON.parse(raw.text) as T, raw };
  } catch (err) {
    logger.error({ err, text: raw.text }, "LLM did not return parseable JSON");
    throw new Error("LLM JSON parse failed");
  }
}
