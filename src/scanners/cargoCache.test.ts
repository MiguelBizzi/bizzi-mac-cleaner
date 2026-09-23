import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

import { collect } from "../test/collect.js";
import { cargoCacheScanner } from "./cargoCache.js";

describe("cargoCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("reports registry cache and src separately", async () => {
    vol.fromJSON({
      "/fixture/.cargo/registry/cache/crate.crate": "c".repeat(1800),
      "/fixture/.cargo/registry/src/crate/lib.rs": "r".repeat(400),
    });
    const items = await collect(cargoCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.category === "cargo_cache" && i.risk === "safe")).toBe(true);
  });
});
