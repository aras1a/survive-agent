import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// We must set STATE_DIR before importing the module.
const tempDir = await mkdtemp(join(tmpdir(), "survive-agent-state-"));
process.env.STATE_DIR = tempDir;

const { StateStore } = await import("./state.js");

test("StateStore returns defaults when file missing", async () => {
  const s = new StateStore<{ counter: number; tag: string }>("test-defaults", {
    counter: 0,
    tag: "init",
  });
  const data = await s.load();
  assert.equal(data.counter, 0);
  assert.equal(data.tag, "init");
});

test("StateStore persists updates across instances", async () => {
  type S = { counter: number };
  const store1 = new StateStore<S>("test-persist", { counter: 0 });
  await store1.update((d) => {
    d.counter = 7;
  });
  const store2 = new StateStore<S>("test-persist", { counter: 0 });
  const data = await store2.load();
  assert.equal(data.counter, 7);
});

test("StateStore merges defaults with stored partial", async () => {
  const store1 = new StateStore<{ a: number; b: number }>("test-merge", { a: 1, b: 2 });
  await store1.update((d) => {
    d.a = 99;
  });
  // simulate adding a new field by changing defaults in a fresh constructor
  const store2 = new StateStore<{ a: number; b: number; c: string }>("test-merge", {
    a: 0,
    b: 0,
    c: "default",
  });
  const data = await store2.load();
  assert.equal(data.a, 99);
  assert.equal(data.b, 2);
  assert.equal(data.c, "default");
});

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
