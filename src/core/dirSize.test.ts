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

import { dirSize, sizeInline } from "./dirSize.js";

describe("dirSize", () => {
  beforeEach(() => vol.reset());

  it("sums nested file sizes and ignores missing roots", async () => {
    vol.fromJSON({
      "/fixture/a.txt": "aaaa",
      "/fixture/nested/b.txt": "bbbbbb",
    });
    expect(await sizeInline("/fixture")).toBe(10);
    expect(await dirSize("/fixture")).toBe(10);
    expect(await sizeInline("/fixture/missing")).toBe(0);
  });
});
