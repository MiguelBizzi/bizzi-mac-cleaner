import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/shell/exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));
const readdir = vi.fn();
vi.mock("../core/fs.js", () => ({ fs: {}, fsp: { readdir: (...a: unknown[]) => readdir(...a) } }));

import { execCommand } from "../core/shell/exec.js";
import {
  allocatedBytes,
  darwinUserDirs,
  isAppRunning,
  localSnapshots,
  plistValue,
  probeFullDiskAccess,
  runningApps,
  simulatorRuntimes,
} from "./probes.js";

type Canned = Record<string, string | Error>;
function mockExecMap(map: Canned): void {
  vi.mocked(execCommand).mockImplementation(async (cmd: string, args: string[]) => {
    const hit = map[`${cmd} ${args.join(" ")}`] ?? map[cmd];
    if (hit === undefined || hit instanceof Error) throw hit ?? new Error(`unexpected ${cmd}`);
    return { stdout: hit, stderr: "" };
  });
}
const mockExec = (cmd: string, stdout: string) => mockExecMap({ [cmd]: stdout });
const mockExecReject = (cmd: string) => mockExecMap({ [cmd]: new Error("boom") });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("localSnapshots", () => {
  it("parses local snapshot dates", async () => {
    mockExec(
      "/usr/bin/tmutil",
      "Snapshots for disk /:\ncom.apple.TimeMachine.2026-11-20-101500.local\ncom.apple.TimeMachine.2026-11-21-090000.local\n",
    );
    const d = await localSnapshots();
    // Snapshot names are local time, so compare local components.
    expect(d?.map((x) => [x.getFullYear(), x.getMonth() + 1, x.getDate(), x.getHours(), x.getMinutes()])).toEqual([
      [2026, 11, 20, 10, 15],
      [2026, 11, 21, 9, 0],
    ]);
    expect(execCommand).toHaveBeenCalledWith("/usr/bin/tmutil", ["listlocalsnapshots", "/"], expect.anything());
  });
  it("returns null when tmutil fails", async () => {
    mockExecReject("/usr/bin/tmutil");
    expect(await localSnapshots()).toBeNull();
  });
  it("returns an empty list when there are no snapshots", async () => {
    mockExec("/usr/bin/tmutil", "Snapshots for disk /:\n");
    expect(await localSnapshots()).toEqual([]);
  });
});

describe("runningApps / isAppRunning", () => {
  it("reads running bundle ids and process names", async () => {
    mockExecMap({
      "/bin/ps": "/Applications/Slack.app/Contents/MacOS/Slack\n/usr/sbin/cfprefsd\n",
      "/usr/bin/lsappinfo": '"Slack" ASN:0x0-0x1: \n    bundleID="com.tinyspeck.slackmacgap"\n    bundleID=[ NULL ] \n',
    });
    const apps = await runningApps();
    expect(isAppRunning(apps, "bundleIdFolder", "com.tinyspeck.slackmacgap")).toBe(true);
    expect(isAppRunning(apps, "bundleIdFolder", "COM.TinySpeck.SlackMacGap")).toBe(true);
    expect(isAppRunning(apps, "folderName", "Slack")).toBe(true);
    expect(isAppRunning(apps, "folderName", "Discord")).toBe(false);
    expect(isAppRunning(apps, { names: ["CfPrefsd"] })).toBe(true);
    expect(isAppRunning(apps, { names: ["nope"] })).toBe(false);
    expect(apps.bundleIds.size).toBe(1);
  });
  it("matches helper processes by name prefix and keeps the .app bundle name", async () => {
    mockExecMap({
      "/bin/ps": "/Applications/Google Chrome.app/Contents/Frameworks/X/Google Chrome Helper\n",
      "/usr/bin/lsappinfo": "",
    });
    const apps = await runningApps();
    expect(isAppRunning(apps, "folderName", "Google Chrome")).toBe(true);
    expect(isAppRunning(apps, "folderName", "Goog")).toBe(false);
  });
  it("fails closed: ok:false when a tool fails, and every defined check reads as running", async () => {
    vi.mocked(execCommand).mockRejectedValue(new Error("x"));
    const apps = await runningApps();
    expect(apps).toMatchObject({ ok: false });
    expect(apps.names.size).toBe(0);
    expect(apps.bundleIds.size).toBe(0);
    expect(isAppRunning(apps, "folderName", "Discord")).toBe(true);
    expect(isAppRunning(apps, "bundleIdFolder", "com.x")).toBe(true);
    expect(isAppRunning(apps, { names: ["x"] })).toBe(true);
    expect(isAppRunning(apps, undefined)).toBe(false);
  });
  it("is ok:false if only one tool fails", async () => {
    mockExecMap({ "/bin/ps": "/usr/sbin/cfprefsd\n", "/usr/bin/lsappinfo": new Error("t") });
    expect((await runningApps()).ok).toBe(false);
  });
  it("a check that cannot be evaluated (no wildcard value) reads as running", async () => {
    mockExecMap({ "/bin/ps": "x\n", "/usr/bin/lsappinfo": "" });
    const apps = await runningApps();
    expect(apps.ok).toBe(true);
    expect(isAppRunning(apps, "folderName")).toBe(true);
    expect(isAppRunning(apps, "bundleIdFolder")).toBe(true);
    expect(isAppRunning(apps, undefined)).toBe(false);
  });
});

describe("plistValue", () => {
  it("passes the file as a single argv element and trims", async () => {
    mockExec("/usr/bin/plutil", "Notes\n");
    expect(await plistValue("/a b/Info.plist; rm -rf /", "CFBundleName")).toBe("Notes");
    expect(execCommand).toHaveBeenCalledWith(
      "/usr/bin/plutil",
      ["-extract", "CFBundleName", "raw", "-o", "-", "/a b/Info.plist; rm -rf /"],
      expect.anything(),
    );
  });
  it("returns null on failure or empty output", async () => {
    mockExecReject("/usr/bin/plutil");
    expect(await plistValue("/x", "k")).toBeNull();
    mockExec("/usr/bin/plutil", "  \n");
    expect(await plistValue("/x", "k")).toBeNull();
  });
});

describe("simulatorRuntimes", () => {
  it("parses simctl runtimes", async () => {
    mockExec(
      "/usr/bin/xcrun",
      JSON.stringify({
        "UUID-1": { identifier: "UUID-1", version: "17.5", sizeBytes: 7_000_000_000, lastUsedAt: "2025-01-02T00:00:00Z", deletable: true },
      }),
    );
    const r = await simulatorRuntimes();
    expect(r?.[0]).toMatchObject({ identifier: "UUID-1", version: "17.5", sizeBytes: 7_000_000_000, deletable: true });
    expect(r?.[0]?.lastUsedAt?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect(execCommand).toHaveBeenCalledWith("/usr/bin/xcrun", ["simctl", "runtime", "list", "-j"], expect.anything());
  });
  it("is defensive about missing or wrong-typed fields", async () => {
    mockExec(
      "/usr/bin/xcrun",
      JSON.stringify({
        a: { identifier: "A" },
        b: { identifier: "B", version: 17, sizeBytes: "big", lastUsedAt: "garbage", deletable: "yes" },
        c: { version: "1" },
        d: "str",
        e: null,
      }),
    );
    const r = await simulatorRuntimes();
    expect(r).toEqual([
      { identifier: "A", version: "", sizeBytes: null, lastUsedAt: null, deletable: false },
      { identifier: "B", version: "", sizeBytes: null, lastUsedAt: null, deletable: false },
    ]);
  });
  it("returns [] for {} and null for bad JSON or failure", async () => {
    mockExec("/usr/bin/xcrun", "{\n\n}");
    expect(await simulatorRuntimes()).toEqual([]);
    mockExec("/usr/bin/xcrun", "not json");
    expect(await simulatorRuntimes()).toBeNull();
    mockExecReject("/usr/bin/xcrun");
    expect(await simulatorRuntimes()).toBeNull();
  });
});

describe("darwinUserDirs", () => {
  it("rejects getconf output outside /var/folders", async () => {
    mockExec("/usr/bin/getconf", "/Users/x/Documents/\n");
    expect(await darwinUserDirs()).toEqual([]);
  });
  it("accepts /var/folders and /private/var/folders paths", async () => {
    mockExecMap({
      "/usr/bin/getconf DARWIN_USER_CACHE_DIR": "/var/folders/ab/xyz/C/\n",
      "/usr/bin/getconf DARWIN_USER_TEMP_DIR": "/private/var/folders/ab/xyz/T/\n",
    });
    expect(await darwinUserDirs()).toEqual(["/var/folders/ab/xyz/C/", "/private/var/folders/ab/xyz/T/"]);
  });
  it("rejects traversal and returns [] on failure", async () => {
    mockExec("/usr/bin/getconf", "/var/folders/../../Users/x\n");
    expect(await darwinUserDirs()).toEqual([]);
    mockExecReject("/usr/bin/getconf");
    expect(await darwinUserDirs()).toEqual([]);
  });
});

describe("allocatedBytes", () => {
  it("uses allocated blocks for sparse files", () => {
    expect(allocatedBytes({ size: 64e9, blocks: 17_578_125 })).toBe(9e9);
    expect(allocatedBytes({ size: 100 })).toBe(100);
  });
});

describe("probeFullDiskAccess", () => {
  const err = (code: string) => Object.assign(new Error(code), { code });
  it("denied on EPERM/EACCES", async () => {
    readdir.mockRejectedValue(err("EPERM"));
    expect(await probeFullDiskAccess("/h")).toBe("denied");
    readdir.mockRejectedValue(err("EACCES"));
    expect(await probeFullDiskAccess("/h")).toBe("denied");
    expect(readdir).toHaveBeenCalledWith("/h/Library/Safari");
  });
  it("granted when readable, unknown otherwise", async () => {
    readdir.mockResolvedValue([]);
    expect(await probeFullDiskAccess("/h")).toBe("granted");
    readdir.mockRejectedValue(err("ENOENT"));
    expect(await probeFullDiskAccess("/h")).toBe("unknown");
    readdir.mockRejectedValue("weird");
    expect(await probeFullDiskAccess("/h")).toBe("unknown");
  });
});
