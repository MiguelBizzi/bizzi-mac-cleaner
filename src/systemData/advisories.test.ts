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
vi.mock("../core/shell/exec.js", () => ({ execCommand: vi.fn() }));

import { categoryViolation } from "../core/deletePolicy.js";
import { fsp } from "../core/fs.js";
import { execCommand } from "../core/shell/exec.js";
import { collect } from "../test/collect.js";
import { scanAdvisories } from "./advisories.js";
import type { SystemDataContext } from "./context.js";
import { setMacOSForTests } from "./macos.js";
import { systemDataScanner } from "./scanner.js";

const ctx = (over: Partial<SystemDataContext> = {}): SystemDataContext => ({
  macos: { major: 27, minor: 0, patch: 0 },
  support: "verified",
  fda: "granted",
  apps: { names: new Set(), bundleIds: new Set(), ok: true },
  shell: false,
  ...over,
});
const opts = { root: "/h", staleDays: 30 };
const exec = vi.mocked(execCommand);

function mockExec(map: Record<string, string>): void {
  exec.mockImplementation(async (file: string, args: string[]) => {
    const key = [file, ...args].join(" ");
    for (const [k, v] of Object.entries(map)) if (key.startsWith(k)) return { stdout: v, stderr: "" } as never;
    throw new Error(`no mock for ${key}`);
  });
}

describe("scanAdvisories", () => {
  beforeEach(() => {
    vol.reset();
    exec.mockReset();
    exec.mockRejectedValue(new Error("no exec"));
    setMacOSForTests({ major: 27, minor: 0, patch: 0 });
  });
  afterEach(() => {
    setMacOSForTests(undefined);
    vi.restoreAllMocks();
  });

  it("reports Docker.raw by allocated size", async () => {
    vol.fromJSON({ "/h/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw": "" });
    vi.spyOn(fsp, "lstat").mockResolvedValueOnce({
      size: 64e9,
      blocks: 17_578_125,
      mtime: new Date(),
      isDirectory: () => false,
    } as never);
    const items = await collect(scanAdvisories(opts, ctx()));
    expect(items.find((i) => i.targetId === "vm.docker_raw")).toMatchObject({ advisory: true, sizeBytes: 9e9 });
  });

  it("emits Apple Intelligence only from 15.1", async () => {
    const at = async (minor: number) =>
      (await collect(scanAdvisories(opts, ctx({ macos: { major: 15, minor, patch: 0 } })))).some(
        (i) => i.targetId === "ai.apple_intelligence",
      );
    expect(await at(0)).toBe(false);
    expect(await at(1)).toBe(true);
  });

  it("emits nothing that needs a shell for a fixture root", async () => {
    const items = await collect(scanAdvisories({ root: "/tmp/f", staleDays: 30 }, ctx({ shell: false })));
    expect(
      items.some((i) => ["snapshots.tm_local", "dev.simulator_runtimes", "sys.var_folders"].includes(i.targetId!)),
    ).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("measures directories and skips missing ones", async () => {
    vol.fromJSON({
      "/h/.ollama/models/blobs/a": "x".repeat(100),
      "/h/go/pkg/mod/a": "x".repeat(10),
    });
    const items = await collect(scanAdvisories(opts, ctx()));
    expect(items.find((i) => i.targetId === "ai.ollama")).toMatchObject({
      advisory: true,
      path: "/h/.ollama/models",
      category: "system_data",
      risk: "caution",
    });
    expect(items.find((i) => i.targetId === "ai.ollama")!.sizeBytes).toBeGreaterThan(0);
    expect(items.some((i) => i.targetId === "dev.go_modcache")).toBe(true);
    expect(items.some((i) => i.targetId === "vm.colima")).toBe(false);
  });

  it("reports local snapshots with count and oldest date", async () => {
    mockExec({
      "/usr/bin/tmutil": "Snapshots for volume group containing disk /:\ncom.apple.TimeMachine.2026-11-20-101010.local\ncom.apple.TimeMachine.2026-11-22-101010.local\n",
    });
    const items = await collect(scanAdvisories(opts, ctx({ shell: true })));
    const snap = items.find((i) => i.targetId === "snapshots.tm_local")!;
    expect(snap).toMatchObject({ advisory: true, sizeBytes: 0, sizeUnknown: true });
    expect(snap.note).toContain("2");
    expect(snap.note).toContain("2026-11-20");
  });

  it("emits no snapshot item when none exist or tmutil fails", async () => {
    mockExec({ "/usr/bin/tmutil": "Snapshots for volume group containing disk /:\n" });
    expect((await collect(scanAdvisories(opts, ctx({ shell: true })))).some((i) => i.targetId === "snapshots.tm_local")).toBe(false);
    exec.mockRejectedValue(new Error("boom"));
    expect((await collect(scanAdvisories(opts, ctx({ shell: true })))).some((i) => i.targetId === "snapshots.tm_local")).toBe(false);
  });

  it("emits one item per simulator runtime, tolerating missing fields", async () => {
    mockExec({
      "/usr/bin/xcrun": JSON.stringify({
        A: { identifier: "A", version: "18.0", sizeBytes: 5e9, lastUsedAt: "2026-10-01T12:00:00Z", deletable: true },
        B: { identifier: "B", version: "17.5" },
        C: { identifier: "../..", version: "" },
      }),
    });
    const items = (await collect(scanAdvisories(opts, ctx({ shell: true })))).filter(
      (i) => i.targetId === "dev.simulator_runtimes",
    );
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    expect(new Set(items.map((i) => i.path)).size).toBe(3);
    expect(items.find((i) => i.description?.includes("18.0"))).toMatchObject({ sizeBytes: 5e9 });
    expect(items.find((i) => i.description?.includes("18.0"))!.sizeUnknown).toBeFalsy();
    expect(items.find((i) => i.description?.includes("18.0"))!.note).toContain("2026-10-01");
    expect(items.find((i) => i.description?.includes("17.5"))).toMatchObject({ sizeBytes: 0, sizeUnknown: true });
    for (const i of items) expect(i.path.startsWith("/h/")).toBe(true);
  });

  it("sums darwin user dirs for var_folders", async () => {
    vol.fromJSON({
      "/private/var/folders/ab/c/C/x": "x".repeat(50),
      "/private/var/folders/ab/c/T/y": "x".repeat(50),
    });
    mockExec({
      "/usr/bin/getconf DARWIN_USER_CACHE_DIR": "/private/var/folders/ab/c/C/\n",
      "/usr/bin/getconf DARWIN_USER_TEMP_DIR": "/private/var/folders/ab/c/T/\n",
    });
    const items = await collect(scanAdvisories(opts, ctx({ shell: true })));
    const v = items.find((i) => i.targetId === "sys.var_folders")!;
    expect(v.advisory).toBe(true);
    expect(v.sizeBytes).toBeGreaterThan(0);
  });

  it("emits a needs-FDA advisory for Messages attachments without reading them", async () => {
    vol.fromJSON({ "/h/Library/Messages/Attachments/a": "x" });
    const spy = vi.spyOn(fsp, "readdir");
    const items = await collect(scanAdvisories(opts, ctx({ fda: "denied" })));
    const a = items.filter((i) => i.targetId === "messages.attachments");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ advisory: true, sizeUnknown: true });
    expect(spy).not.toHaveBeenCalledWith("/h/Library/Messages/Attachments");
  });

  it("measures Messages attachments when FDA is granted", async () => {
    vol.fromJSON({ "/h/Library/Messages/Attachments/a": "x".repeat(20) });
    const items = await collect(scanAdvisories(opts, ctx()));
    expect(items.find((i) => i.targetId === "messages.attachments")).toMatchObject({ advisory: true });
    expect(items.find((i) => i.targetId === "messages.attachments")!.sizeBytes).toBeGreaterThan(0);
  });

  it("every advisory is advisory, caution, system_data, unique, and never policy-allowed", async () => {
    vol.fromJSON({
      "/h/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw": "x",
      "/h/.colima/a": "x",
      "/h/.ollama/models/a": "x",
      "/h/go/pkg/mod/a": "x",
      "/h/Library/Messages/Attachments/a": "x",
      "/private/var/folders/ab/c/C/x": "x",
    });
    mockExec({
      "/usr/bin/tmutil": "com.apple.TimeMachine.2026-11-20-101010.local\n",
      "/usr/bin/xcrun": JSON.stringify({ A: { identifier: "A", version: "18.0" } }),
      "/usr/bin/getconf DARWIN_USER_CACHE_DIR": "/private/var/folders/ab/c/C/\n",
      "/usr/bin/getconf DARWIN_USER_TEMP_DIR": "",
    });
    const items = await collect(scanAdvisories(opts, ctx({ shell: true })));
    const ids = new Set(items.map((i) => i.targetId));
    for (const t of [
      "snapshots.tm_local", "dev.simulator_runtimes", "vm.docker_raw", "vm.colima", "ai.ollama",
      "dev.go_modcache", "messages.attachments", "ai.apple_intelligence", "sys.var_folders",
    ]) expect(ids.has(t)).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      expect(i).toMatchObject({ advisory: true, category: "system_data", risk: "caution" });
      expect(categoryViolation("system_data", i.path, "/h")).not.toBeNull();
    }
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await collect(scanAdvisories({ ...opts, signal: ac.signal }, ctx()))).toEqual([]);
  });
});

describe("systemDataScanner on an unsupported macOS", () => {
  afterEach(() => setMacOSForTests(undefined));
  it("yields advisories only", async () => {
    vol.reset();
    setMacOSForTests({ major: 11, minor: 7, patch: 0 });
    vol.fromJSON({ "/f/Library/Logs/x/a": "x", "/f/.ollama/models/a": "x".repeat(10) });
    const items = await collect(systemDataScanner.scan({ root: "/f", staleDays: 30 }));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.advisory === true)).toBe(true);
    expect(items.some((i) => i.targetId === "ai.ollama")).toBe(true);
  });
});
