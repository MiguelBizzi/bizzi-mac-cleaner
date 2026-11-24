import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/shell/exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));
const readdir = vi.fn();
vi.mock("../core/fs.js", () => ({ fs: {}, fsp: { readdir: (...a: unknown[]) => readdir(...a) } }));

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
});
