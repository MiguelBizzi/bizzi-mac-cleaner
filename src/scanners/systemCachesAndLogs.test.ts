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
import { systemCachesAndLogsScanner } from "./systemCachesAndLogs.js";

describe("systemCachesAndLogsScanner", () => {
  beforeEach(() => vol.reset());

  it("reports every Library/Caches folder except those owned by other scanners", async () => {
    vol.fromJSON({
      "/fixture/Library/Caches/typescript/ts.buildinfo": "t".repeat(256),
      "/fixture/Library/Caches/com.apple.Safari/foo": "s".repeat(128),
      "/fixture/Library/Caches/Homebrew/bottle": "owned-elsewhere",
      "/fixture/Library/Logs/app.log": "l".repeat(128),
      "/fixture/Library/HTTPStorages/cache.db": "h".repeat(64),
      "/fixture/Library/WebKit/WebsiteData/blob": "w".repeat(64),
    });
    const items = await collect(
      systemCachesAndLogsScanner.scan({ root: "/fixture", staleDays: 30 }),
    );
    const paths = items.map((i) => i.path);
    expect(paths.some((p) => p.endsWith("typescript"))).toBe(true);
    expect(paths.some((p) => p.includes("Safari"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Logs"))).toBe(true);
    expect(paths.some((p) => p.endsWith("HTTPStorages"))).toBe(true);
    expect(paths.some((p) => p.endsWith("WebKit"))).toBe(true);
    expect(paths.some((p) => p.includes("Homebrew"))).toBe(false);
    expect(items.find((i) => i.path.includes("Safari"))?.risk).toBe("caution");
    expect(items.find((i) => i.path.endsWith("HTTPStorages"))?.risk).toBe("caution");
    expect(items.find((i) => i.path.endsWith("WebKit"))?.risk).toBe("caution");
    expect(items.find((i) => i.path.endsWith("Logs"))?.risk).toBe("safe");
    expect(items.find((i) => i.path.endsWith("typescript"))?.risk).toBe("safe");
  });
});
