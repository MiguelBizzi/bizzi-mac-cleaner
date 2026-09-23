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
import { trashBinScanner } from "./trashBin.js";

describe("trashBinScanner", () => {
  beforeEach(() => vol.reset());

  it("reports .Trash as caution", async () => {
    vol.fromJSON({
      "/fixture/.Trash/old-screenshot.png": "t".repeat(700),
    });
    const items = await collect(trashBinScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("trash_bin");
    expect(items[0]?.risk).toBe("caution");
  });
});
