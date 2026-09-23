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
import { xcodeArchivesScanner } from "./xcodeArchives.js";

describe("xcodeArchivesScanner", () => {
  beforeEach(() => vol.reset());

  it("flags archives as caution", async () => {
    vol.fromJSON({
      "/fixture/Library/Developer/Xcode/Archives/App.xcarchive/Info.plist": "<plist/>",
    });
    const items = await collect(xcodeArchivesScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("xcode_archives");
    expect(items[0]?.risk).toBe("caution");
  });
});
