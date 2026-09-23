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

import { TopN } from "../core/topN.js";
import { collect } from "../test/collect.js";
import { largestFilesScanner } from "./largestFiles.js";
import type { CleanupItem } from "./types.js";

describe("largestFilesScanner", () => {
  beforeEach(() => vol.reset());

  it("streams the largest individual files and respects top-N", async () => {
    vol.fromJSON({
      "/fixture/small.txt": "s".repeat(10),
      "/fixture/Documents/nested/dump.bin": "d".repeat(8000),
      "/fixture/Downloads/installer.dmg": "i".repeat(5000),
      "/fixture/Movies/clip.mov": "m".repeat(3000),
    });
    const yielded = await collect(
      largestFilesScanner.scan({ root: "/fixture", staleDays: 30, largestFilesCount: 2 }),
    );
    const top = new TopN<CleanupItem>(2, (i) => i.sizeBytes);
    for (const item of yielded) top.push(item);
    const ranked = top.toArray();
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.path).toContain("dump.bin");
    expect(ranked[1]?.path).toContain("installer.dmg");
    expect(ranked.every((i) => i.category === "largest_files")).toBe(true);
  });

  it("does not yield files under .ssh or Library", async () => {
    vol.fromJSON({
      "/fixture/.ssh/id_rsa": "k".repeat(9000),
      "/fixture/Library/Keychains/login.keychain-db": "k".repeat(9000),
      "/fixture/Downloads/ok.bin": "o".repeat(4000),
    });
    const yielded = await collect(
      largestFilesScanner.scan({ root: "/fixture", staleDays: 30, largestFilesCount: 10 }),
    );
    expect(yielded.some((i) => i.path.includes(".ssh"))).toBe(false);
    expect(yielded.some((i) => i.path.includes("Keychains"))).toBe(false);
    expect(yielded.some((i) => i.path.includes("ok.bin"))).toBe(true);
  });
});
