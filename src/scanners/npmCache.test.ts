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
import { npmCacheScanner } from "./npmCache.js";

describe("npmCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("reports ~/.npm/_cacache under the scan root", async () => {
    vol.fromJSON({
      "/fixture/.npm/_cacache/content-v2/sha512/ab": "n".repeat(5000),
    });
    const items = await collect(npmCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("npm_cache");
    expect(items[0]?.risk).toBe("safe");
    expect(items[0]?.path).toContain("_cacache");
    expect(items[0]?.sizeBytes).toBeGreaterThan(0);
  });

  it("yields nothing when the cache is missing", async () => {
    vol.fromJSON({ "/fixture/.keep": "" });
    const items = await collect(npmCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toEqual([]);
  });
});
