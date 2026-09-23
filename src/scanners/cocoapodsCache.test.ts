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
import { cocoapodsCacheScanner } from "./cocoapodsCache.js";

describe("cocoapodsCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds CocoaPods cache", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/CocoaPods/Pods/cache.bin": "c".repeat(1024),
    });
    const items = await collect(cocoapodsCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("cocoapods_cache");
  });
});
