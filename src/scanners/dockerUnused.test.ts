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
import { dockerUnusedScanner } from "./dockerUnused.js";

describe("dockerUnusedScanner", () => {
  beforeEach(() => vol.reset());

  it("reports docker cache folders as caution", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/com.docker.docker/log.txt": "d".repeat(1024),
    });
    const items = await collect(dockerUnusedScanner.scan({ root: "/fixture", staleDays: 30 }));
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("docker_unused");
    expect(items[0]?.risk).toBe("caution");
  });
});
