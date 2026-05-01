import { strict as assert } from "node:assert";
import { test } from "node:test";
import { humanizeMs, msUntil } from "./time.js";

test("humanizeMs handles negative", () => {
  assert.equal(humanizeMs(-1), "expired");
  assert.equal(humanizeMs(0), "0d 0h 0m");
});

test("humanizeMs formats days/hours/minutes", () => {
  const day = 86_400_000;
  const hour = 3_600_000;
  const minute = 60_000;
  assert.equal(humanizeMs(2 * day + 3 * hour + 4 * minute), "2d 3h 4m");
});

test("msUntil returns positive in the future", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const v = msUntil(future);
  assert.ok(v > 0 && v <= 60_000);
});
