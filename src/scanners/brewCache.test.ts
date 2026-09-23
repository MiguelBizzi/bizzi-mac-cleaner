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
import { brewCacheScanner } from "./brewCache.js";

describe("brewCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds Library/Caches/Homebrew under the scan root", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/Homebrew/foo--1.0.bottle.tar.gz": "b".repeat(4096),
    });
    const items = await collect(brewCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("brew_cache");
    expect(items[0]?.risk).toBe("safe");
    expect(items[0]?.path).toContain("Homebrew");
  });
});
