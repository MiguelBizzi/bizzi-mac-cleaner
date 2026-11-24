import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/shell/exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));
const readdir = vi.fn();
vi.mock("../core/fs.js", () => ({ fs: {}, fsp: { readdir: (...a: unknown[]) => readdir(...a) } }));

const helperState = { throwNext: false };
vi.mock("../scanners/helpers.js", async (orig) => {
  const actual = await orig<typeof import("../scanners/helpers.js")>();
  return {
    ...actual,
    allowShellDiscovery: (root: string) => {
      if (helperState.throwNext) {
        helperState.throwNext = false;
        throw new Error("boom");
      }
      return actual.allowShellDiscovery(root);
    },
  };
});

import os from "node:os";
import { execCommand } from "../core/shell/exec.js";
import { getSystemDataContext, resetSystemDataContextForTests } from "./context.js";
import { setMacOSForTests } from "./macos.js";

beforeEach(() => {
  vi.resetAllMocks();
  resetSystemDataContextForTests();
  setMacOSForTests({ major: 27, minor: 0, patch: 0 });
});

describe("getSystemDataContext", () => {
  it("never shells out for a fixture root", async () => {
    const ctx = await getSystemDataContext("/tmp/fixture");
    expect(ctx.shell).toBe(false);
    expect(ctx.fda).toBe("unknown");
    expect(ctx.apps.ok).toBe(true);
    expect(ctx.apps.names.size).toBe(0);
    expect(ctx.apps.bundleIds.size).toBe(0);
    expect(ctx.macos).toEqual({ major: 27, minor: 0, patch: 0 });
    expect(ctx.support).toBe("verified");
    expect(execCommand).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("probes for the real home root and caches per root", async () => {
    readdir.mockResolvedValue([]);
    vi.mocked(execCommand).mockImplementation(async (cmd: string) => ({
      stdout: cmd === "/usr/bin/lsappinfo" ? 'bundleID="com.example.App"\n' : "/usr/sbin/cfprefsd\n",
      stderr: "",
    }));
    const home = os.homedir();
    const a = await getSystemDataContext(home);
    expect(a.shell).toBe(true);
    expect(a.fda).toBe("granted");
    expect(a.apps.bundleIds.has("com.example.app")).toBe(true);
    const calls = vi.mocked(execCommand).mock.calls.length;
    expect(await getSystemDataContext(home)).toBe(a);
    expect(vi.mocked(execCommand).mock.calls.length).toBe(calls);
  });

  it("returns a conservative context on a throw and does not poison the cache", async () => {
    const home = os.homedir();
    helperState.throwNext = true;
    const bad = await getSystemDataContext(home);
    expect(bad).toMatchObject({ macos: null, support: "unverified", fda: "unknown", shell: false });
    expect(bad.apps.ok).toBe(false);
    readdir.mockResolvedValue([]);
    vi.mocked(execCommand).mockResolvedValue({ stdout: "", stderr: "" });
    const good = await getSystemDataContext(home);
    expect(good.shell).toBe(true);
    expect(good.apps.ok).toBe(true);
  });
});
