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
import { gradleCacheScanner } from "./gradleCache.js";

describe("gradleCacheScanner", () => {
  beforeEach(() => vol.reset());

  it("finds ~/.gradle/caches", async () => {
    vol.fromJSON({
      "/fixture/.gradle/caches/modules-2/files-2.1/a.jar": "g".repeat(2048),
    });
    const items = await collect(gradleCacheScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("gradle_cache");
    expect(items[0]?.risk).toBe("safe");
  });
});
