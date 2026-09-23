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
import { pnpmCacheScanner } from "./pnpmCache.js";

describe("pnpmCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds the pnpm store under the scan root", async () => {
    vol.fromJSON({
      "/fixture/.local/share/pnpm/store/v3/files/ab": "p".repeat(3000),
    });
    const items = await collect(pnpmCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("pnpm_cache");
  });
});
