import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimateCostUsd } from "./pricing.js";

test("estimateCostUsd mimo-flash basic math", () => {
  // 1M input, 1M output -> 0.11 + 0.32 = 0.43
  const cost = estimateCostUsd("mimo-flash", 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 0.43) < 1e-9);
});

test("estimateCostUsd mimo-pro basic math", () => {
  // 1M input, 1M output -> 1.05 + 3.15 = 4.20
  const cost = estimateCostUsd("mimo-pro", 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 4.2) < 1e-9);
});

test("estimateCostUsd anthropic default", () => {
  const cost = estimateCostUsd("anthropic", 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 6.0) < 1e-9);
});

test("estimateCostUsd zero is zero", () => {
  assert.equal(estimateCostUsd("mimo-flash", 0, 0), 0);
});
