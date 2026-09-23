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

import { fsp } from "../core/fs.js";
import { collect } from "../test/collect.js";
import { nodeModulesScanner } from "./nodeModules.js";

const root = "/fixture";
const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
const recent = new Date();

describe("nodeModulesScanner", () => {
  beforeEach(() => vol.reset());

  it("flags stale projects as safe and active ones as caution", async () => {
    vol.fromJSON({
      "/fixture/Projects/stale-app/package.json": '{"name":"stale-app"}',
      "/fixture/Projects/stale-app/node_modules/pkg/index.js": "x".repeat(2048),
      "/fixture/Projects/active-app/package.json": '{"name":"active-app"}',
      "/fixture/Projects/active-app/node_modules/pkg/index.js": "y".repeat(4096),
    });
    await fsp.utimes("/fixture/Projects/stale-app/package.json", stale, stale);
    await fsp.utimes("/fixture/Projects/stale-app", stale, stale);
    await fsp.utimes("/fixture/Projects/active-app/package.json", recent, recent);
    await fsp.utimes("/fixture/Projects/active-app", recent, recent);

    const items = await collect(nodeModulesScanner.scan({ root, staleDays: 30 }));
    expect(items).toHaveLength(2);
    const staleItem = items.find((i) => i.description === "stale-app");
    const activeItem = items.find((i) => i.description === "active-app");
    expect(staleItem?.stale).toBe(true);
    expect(staleItem?.risk).toBe("safe");
    expect(staleItem?.sizeBytes).toBeGreaterThan(0);
    expect(activeItem?.stale).toBe(false);
    expect(activeItem?.risk).toBe("caution");
  });
});
