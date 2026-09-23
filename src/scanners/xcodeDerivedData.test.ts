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
import { xcodeDerivedDataScanner } from "./xcodeDerivedData.js";

describe("xcodeDerivedDataScanner", () => {
  beforeEach(() => vol.reset());

  it("reports DerivedData when present", async () => {
    vol.fromJSON({
      "/fixture/Library/Developer/Xcode/DerivedData/Build/foo.o": "o".repeat(1024),
    });
    const items = await collect(
      xcodeDerivedDataScanner.scan({ root: "/fixture", staleDays: 30 }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("xcode_derived_data");
    expect(items[0]?.risk).toBe("safe");
  });
});
