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

import { categoryViolation } from "../core/deletePolicy.js";
import { collect } from "../test/collect.js";
import { TARGETS } from "./catalog.js";
import type { SystemDataContext } from "./context.js";
import { setMacOSForTests } from "./macos.js";
import { samplePath } from "./match.js";
import { scanDeletableTargets } from "./scanner.js";

const ctx = (over: Partial<SystemDataContext> = {}): SystemDataContext => ({
  macos: { major: 27, minor: 0, patch: 0 },
  support: "verified",
  fda: "granted",
  apps: { names: new Set(), bundleIds: new Set(), ok: true },
  shell: false,
  ...over,
});
const opts = { root: "/h", staleDays: 30 };

describe("scanDeletableTargets", () => {
  beforeEach(() => {
    vol.reset();
    setMacOSForTests({ major: 27, minor: 0, patch: 0 });
  });
  afterEach(() => {
    setMacOSForTests(undefined);
    vi.restoreAllMocks();
  });

  it("offers app caches as safe and Apple caches as caution, skipping owned and never folders", async () => {
    vol.fromJSON({
      "/h/Library/Caches/com.foo/a": "x".repeat(10),
      "/h/Library/Caches/com.apple.Safari/a": "x",
      "/h/Library/Caches/Homebrew/a": "x",
      "/h/Library/Caches/com.apple.bird/a": "x",
      "/h/Library/Caches/TemporaryItems/a": "x",
    });
    const items = await collect(scanDeletableTargets(opts, ctx()));
    expect(items.find((i) => i.path.endsWith("com.foo"))).toMatchObject({ risk: "safe", targetId: "caches.app" });
    expect(items.find((i) => i.path.endsWith("com.apple.Safari"))?.risk).toBe("caution");
    for (const gone of ["Homebrew", "com.apple.bird", "TemporaryItems"]) {
      expect(items.some((i) => i.path.endsWith(gone))).toBe(false);
    }
  });

  it("downgrades a running app's cache and says why", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.tinyspeck.slackmacgap/a": "x" });
    const items = await collect(
      scanDeletableTargets(
        opts,
        ctx({ apps: { names: new Set(), bundleIds: new Set(["com.tinyspeck.slackmacgap"]), ok: true } }),
      ),
    );
    expect(items[0]).toMatchObject({ risk: "caution" });
    expect(items[0]!.note).toContain("com.tinyspeck.slackmacgap");
  });

  it("treats unknown running-app state as running", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.foo/a": "x" });
    const items = await collect(
      scanDeletableTargets(opts, ctx({ apps: { names: new Set(), bundleIds: new Set(), ok: false } })),
    );
    expect(items[0]).toMatchObject({ risk: "caution" });
    expect(items[0]!.note).toBeTruthy();
  });

  it("turns every safe target into caution on an unverified macOS", async () => {
    vol.fromJSON({ "/h/Library/Logs/DiagnosticReports/a.ips": "x" });
    const items = await collect(
      scanDeletableTargets(opts, ctx({ macos: { major: 28, minor: 0, patch: 0 }, support: "unverified" })),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.risk === "caution")).toBe(true);
  });

  it("yields nothing deletable on an unsupported macOS", async () => {
    vol.fromJSON({ "/h/Library/Logs/x/a": "x" });
    expect(await collect(scanDeletableTargets(opts, ctx({ support: "unsupported" })))).toEqual([]);
  });

  it("reports FDA-gated targets instead of reading them", async () => {
    vol.fromJSON({ "/h/Library/Application Support/MobileSync/Backup/abc/Info.plist": "x" });
    const items = await collect(scanDeletableTargets(opts, ctx({ fda: "denied" })));
    const adv = items.filter((i) => i.targetId === "backups.ios");
    expect(adv).toHaveLength(1);
    expect(adv[0]).toMatchObject({ advisory: true, sizeUnknown: true });
    expect(adv[0]!.note).toBeTruthy();
  });

  it("skips container caches without FDA from Sonoma, reads them on Ventura", async () => {
    vol.fromJSON({ "/h/Library/Containers/com.foo/Data/Library/Caches/a": "x" });
    const sonoma = await collect(
      scanDeletableTargets(opts, ctx({ macos: { major: 14, minor: 0, patch: 0 }, fda: "denied" })),
    );
    expect(sonoma.find((i) => i.targetId === "caches.container")?.advisory).toBe(true);
    const ventura = await collect(
      scanDeletableTargets(opts, ctx({ macos: { major: 13, minor: 6, patch: 0 }, fda: "denied" })),
    );
    const item = ventura.find((i) => i.targetId === "caches.container");
    expect(item).toBeTruthy();
    expect(item?.advisory).toBeFalsy();
  });

  it("only offers Chromium caches inside a real userData dir", async () => {
    vol.fromJSON({
      "/h/Library/Application Support/Slack/Local State": "{}",
      "/h/Library/Application Support/Slack/Cache/a": "x",
      "/h/Library/Application Support/MyNotes/Cache/real-data.db": "x",
    });
    const items = await collect(scanDeletableTargets(opts, ctx()));
    expect(items.some((i) => i.path.includes("Slack/Cache"))).toBe(true);
    expect(items.some((i) => i.path.includes("MyNotes"))).toBe(false);
  });

  it("emits the FDA advisory when a matched item cannot be read (TCC), not a zero-size item", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.foo/a": "x" });
    const real = memfs.promises.readdir.bind(memfs.promises);
    vi.spyOn(memfs.promises, "readdir").mockImplementation(((p: string, ...rest: unknown[]) => {
      if (String(p) === "/h/Library/Caches/com.foo") {
        return Promise.reject(Object.assign(new Error("EPERM"), { code: "EPERM" }));
      }
      return (real as (...a: unknown[]) => Promise<unknown>)(p, ...rest);
    }) as never);
    const items = await collect(scanDeletableTargets(opts, ctx()));
    expect(items.some((i) => i.path.endsWith("com.foo") && !i.advisory)).toBe(false);
    expect(items.find((i) => i.targetId === "caches.app")).toMatchObject({ advisory: true, sizeUnknown: true });
  });

  it("describes items with the wildcard value", async () => {
    vol.fromJSON({ "/h/Library/Caches/com.foo/a": "x" });
    const [item] = await collect(scanDeletableTargets(opts, ctx()));
    expect(item!.description).toBe("App caches · com.foo");
  });

  it("every yielded path passes the delete policy", async () => {
    const files: Record<string, string> = {};
    for (const t of TARGETS) {
      if ((t.safety !== "safe" && t.safety !== "review") || t.ownedBy) continue;
      for (const p of t.patterns) {
        if (p.startsWith("/")) continue;
        const segs = samplePath(p);
        files[`/h/${segs.join("/")}/f`] = "x";
        if (t.markerAnyOf) {
          const i = p.split("/").findIndex((s) => s.includes("*"));
          files[`/h/${segs.slice(0, i + 1).join("/")}/${t.markerAnyOf[0]}`] = "{}";
        }
      }
    }
    vol.fromJSON(files);
    const items = await collect(scanDeletableTargets(opts, ctx()));
    const deletable = items.filter((i) => !i.advisory);
    expect(deletable.length).toBeGreaterThan(10);
    for (const item of deletable) expect(categoryViolation("system_data", item.path, "/h"), item.path).toBeNull();
    const expectedIds = TARGETS.filter(
      (t) => (t.safety === "safe" || t.safety === "review") && !t.ownedBy,
    ).map((t) => t.id);
    expect(new Set(deletable.map((i) => i.targetId))).toEqual(new Set(expectedIds));
  });

  it("never gives an advisory item a path the delete policy would allow", async () => {
    // Denied FDA: every gated target yields an advisory.
    const denied = await collect(scanDeletableTargets(opts, ctx({ fda: "denied" })));
    const advisories = denied.filter((i) => i.advisory);
    expect(advisories.map((i) => i.targetId)).toEqual(
      expect.arrayContaining(["web.safari_favicons", "mail.downloads", "backups.ios", "caches.container"]),
    );
    // TCC-denied readdir of a matched item.
    vol.fromJSON({ "/h/Library/Caches/com.foo/a": "x" });
    const real = memfs.promises.readdir.bind(memfs.promises);
    vi.spyOn(memfs.promises, "readdir").mockImplementation(((p: string, ...rest: unknown[]) => {
      if (String(p) === "/h/Library/Caches/com.foo") {
        return Promise.reject(Object.assign(new Error("EPERM"), { code: "EPERM" }));
      }
      return (real as (...a: unknown[]) => Promise<unknown>)(p, ...rest);
    }) as never);
    const tcc = (await collect(scanDeletableTargets(opts, ctx()))).filter((i) => i.advisory);
    expect(tcc.length).toBeGreaterThan(0);
    for (const item of [...advisories, ...tcc]) {
      expect(categoryViolation("system_data", item.path, "/h"), `${item.targetId} ${item.path}`).not.toBeNull();
      expect(item.path).not.toBe("/h");
    }
  });
});
