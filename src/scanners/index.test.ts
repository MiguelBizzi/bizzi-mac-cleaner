import { describe, expect, it } from "vitest";
import { collect } from "../test/collect.js";
import { runScanners, scannerById } from "./index.js";
import type { CleanupItem, Scanner } from "./types.js";

const fake: Scanner = {
  id: "npm_cache",
  labelKey: "scanners.npmCache",
  async *scan() {
    const item: CleanupItem = {
      id: "npm_cache:/tmp/a",
      category: "npm_cache",
      path: "/tmp/a",
      sizeBytes: 11,
      lastModified: new Date(0),
      risk: "safe",
    };
    yield item;
  },
};

describe("scanner registry", () => {
  it("runs scanners in order and streams items", async () => {
    const items = await collect(runScanners([fake], { root: "/tmp", staleDays: 30 }));
    expect(items).toEqual([expect.objectContaining({ sizeBytes: 11, category: "npm_cache" })]);
  });

  it("looks up scanners by id", () => {
    expect(scannerById("node_modules")?.id).toBe("node_modules");
    expect(scannerById("nope")).toBeUndefined();
  });
});
