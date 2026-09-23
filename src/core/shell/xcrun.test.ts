import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { commandExists, execCommand } from "./exec.js";
import { simctlListDevices } from "./xcrun.js";

const json = JSON.stringify({
  devices: {
    "iOS 18.0": [
      { name: "iPhone 16", udid: "AAA", state: "Shutdown", isAvailable: true },
      { name: "iPhone old", udid: "BBB", state: "Shutdown", isAvailable: false },
    ],
  },
});

describe("xcrun simctl wrapper", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when xcrun is missing", async () => {
    vi.mocked(commandExists).mockResolvedValue(false);
    expect(await simctlListDevices()).toBeNull();
  });

  it("parses device JSON", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockResolvedValue({ stdout: json, stderr: "" });
    const devices = await simctlListDevices();
    expect(devices).toHaveLength(2);
    expect(devices?.find((d) => d.udid === "BBB")?.unavailable).toBe(true);
  });
});
