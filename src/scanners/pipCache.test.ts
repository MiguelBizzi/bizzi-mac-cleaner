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
import { pipCacheScanner } from "./pipCache.js";

describe("pipCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds Library/Caches/pip", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/pip/wheels/pkg.whl": "p".repeat(1500),
    });
    const items = await collect(pipCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("pip_cache");
  });
});
