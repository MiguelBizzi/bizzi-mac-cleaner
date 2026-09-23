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
import { yarnCacheScanner } from "./yarnCache.js";

describe("yarnCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds Library/Caches/Yarn under the scan root", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/Yarn/v6/npm-foo-1.0.0": "y".repeat(2048),
    });
    const items = await collect(yarnCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("yarn_cache");
    expect(items[0]?.risk).toBe("safe");
  });
});
