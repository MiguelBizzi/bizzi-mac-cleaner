import { fs as memfs, vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs, promises: fs.promises };
});
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

import type { CleanupItem } from "../scanners/types.js";
import type { RunningApps } from "./probes.js";
import { systemDataPreflight } from "./preflight.js";

function item(over: Partial<CleanupItem>): CleanupItem {
  return {
    id: "x",
    category: "system_data",
    path: "/h/Library/Logs/a",
    sizeBytes: 1,
    lastModified: new Date(0),
    risk: "safe",
    ...over,
  };
}
const apps =
  (over: Partial<RunningApps> = {}) =>
  async (): Promise<RunningApps> => ({ names: new Set(), bundleIds: new Set(), ok: true, ...over });
const noApps = apps();

describe("systemDataPreflight", () => {
  beforeEach(() => vol.reset());
  afterEach(() => vol.reset());

  it("allows an existing directory whose app is not running", async () => {
    vol.fromJSON({ "/h/Library/Logs/a/f": "x" });
    expect(await systemDataPreflight(item({ targetId: "logs.user" }), "/h", noApps)).toBeNull();
  });

  it("refuses when the owning app started after the scan", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.tinyspeck.slackmacgap/a": "x" });
    const it = item({
      targetId: "caches.app",
      path: "/h/Library/Caches/com.tinyspeck.slackmacgap",
    });
    const r = await systemDataPreflight(it, "/h", apps({ bundleIds: new Set(["com.tinyspeck.slackmacgap"]) }));
    expect(r).toMatch(/running/i);
  });

  it("refuses when the running-app probe failed (unknown is not 'not running')", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.x.y/a": "x" });
    const it = item({ targetId: "caches.app", path: "/h/Library/Caches/com.x.y" });
    expect(await systemDataPreflight(it, "/h", apps({ ok: false }))).toMatch(/running/i);
  });

  it("does not need the probe for targets without a running check", async () => {
    vol.fromJSON({ "/h/Library/Logs/a/f": "x" });
    expect(await systemDataPreflight(item({ targetId: "logs.user" }), "/h", apps({ ok: false }))).toBeNull();
  });

  it("refuses advisory items even if forced into a batch", async () => {
    expect(await systemDataPreflight(item({ advisory: true, targetId: "vm.docker_raw" }), "/h", noApps)).not.toBeNull();
  });

  it("refuses a path that vanished", async () => {
    expect(await systemDataPreflight(item({ targetId: "logs.user", path: "/h/Library/Logs/gone" }), "/h", noApps)).not.toBeNull();
  });

  it("refuses an unknown or missing target id", async () => {
    vol.fromJSON({ "/h/Library/Logs/a/f": "x" });
    expect(await systemDataPreflight(item({ targetId: "nope.nope" }), "/h", noApps)).not.toBeNull();
    expect(await systemDataPreflight(item({}), "/h", noApps)).not.toBeNull();
  });


  it("refuses a path that became a symlink", async () => {
    vol.fromJSON({ "/elsewhere/f": "x" });
    vol.mkdirSync("/h/Library/Logs", { recursive: true });
    memfs.symlinkSync("/elsewhere", "/h/Library/Logs/a");
    expect(await systemDataPreflight(item({ targetId: "logs.user" }), "/h", noApps)).not.toBeNull();
  });

  it("allows a file for file-pattern targets (.ipsw)", async () => {
    vol.fromJSON({ "/h/Library/iTunes/iPhone Software Updates/a.ipsw": "x" });
    const it = item({
      targetId: "backups.ipsw",
      path: "/h/Library/iTunes/iPhone Software Updates/a.ipsw",
    });
    expect(await systemDataPreflight(it, "/h", noApps)).toBeNull();
  });

  it("refuses a path outside the root", async () => {
    vol.fromJSON({ "/other/a/f": "x" });
    expect(await systemDataPreflight(item({ targetId: "logs.user", path: "/other/a" }), "/h", noApps)).not.toBeNull();
  });

  it("allows a loose file under a wildcard-last pattern (Library/Logs/*)", async () => {
    vol.fromJSON({ "/h/Library/Logs/a": "x" });
    expect(await systemDataPreflight(item({ targetId: "logs.user" }), "/h", noApps)).toBeNull();
  });

  it("still runs the running check for a loose file under caches.app", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.x.y": "x" });
    const it = item({ targetId: "caches.app", path: "/h/Library/Caches/com.x.y" });
    expect(await systemDataPreflight(it, "/h", noApps)).toBeNull();
    expect(await systemDataPreflight(it, "/h", apps({ bundleIds: new Set(["com.x.y"]) }))).toMatch(/running/i);
  });

  it("refuses a literal-last-segment target that turned from dir into a file", async () => {
    vol.fromJSON({ "/h/Library/WebKit": "now a file" });
    expect(await systemDataPreflight(item({ targetId: "web.webkit", path: "/h/Library/WebKit" }), "/h", noApps)).not.toBeNull();
  });

  it("refuses a symlink even under a wildcard-last pattern", async () => {
    vol.fromJSON({ "/elsewhere/f": "x" });
    vol.mkdirSync("/h/Library/Logs", { recursive: true });
    memfs.symlinkSync("/elsewhere/f", "/h/Library/Logs/a");
    expect(await systemDataPreflight(item({ targetId: "logs.user" }), "/h", noApps)).not.toBeNull();
  });
});
