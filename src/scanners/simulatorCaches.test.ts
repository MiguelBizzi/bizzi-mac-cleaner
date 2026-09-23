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
import { simulatorCachesScanner } from "./simulatorCaches.js";

describe("simulatorCachesScanner", () => {
  beforeEach(() => vol.reset());

  it("reports CoreSimulator Caches under a fixture root without shelling out", async () => {
    vol.fromJSON({
      "/fixture/Library/Developer/CoreSimulator/Caches/dyld.bin": "d".repeat(2048),
    });
    const items = await collect(
      simulatorCachesScanner.scan({ root: "/fixture", staleDays: 30 }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("simulator_caches");
    expect(items[0]?.risk).toBe("safe");
  });
});
