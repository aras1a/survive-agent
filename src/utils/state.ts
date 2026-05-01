import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../config.js";

/**
 * Tiny JSON-on-disk persistence helper.
 * Each "namespace" is a separate file under STATE_DIR.
 */
export class StateStore<T extends Record<string, unknown>> {
  private readonly path: string;
  private readonly defaults: T;

  constructor(namespace: string, defaults: T) {
    this.path = join(env.STATE_DIR, `${namespace}.json`);
    this.defaults = defaults;
  }

  async load(): Promise<T> {
    try {
      const raw = await readFile(this.path, "utf-8");
      return { ...this.defaults, ...(JSON.parse(raw) as Partial<T>) } as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...this.defaults };
      throw err;
    }
  }

  async save(data: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(data, null, 2), "utf-8");
  }

  async update(mutator: (data: T) => T | void): Promise<T> {
    const current = await this.load();
    const next = mutator(current);
    const toSave = (next ?? current) as T;
    await this.save(toSave);
    return toSave;
  }
}
