import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./exec.js", () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { commandExists, execCommand } from "./exec.js";
import { dockerSystemDf } from "./docker.js";

describe("docker shell wrapper", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null when docker is missing", async () => {
    vi.mocked(commandExists).mockResolvedValue(false);
    expect(await dockerSystemDf()).toBeNull();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("returns df output when the daemon responds", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockResolvedValue({ stdout: "TYPE  TOTAL\nImages  2GB\n", stderr: "" });
    expect(await dockerSystemDf()).toContain("Images");
  });

  it("returns null when docker is installed but the daemon is down", async () => {
    vi.mocked(commandExists).mockResolvedValue(true);
    vi.mocked(execCommand).mockRejectedValue(new Error("Cannot connect"));
    expect(await dockerSystemDf()).toBeNull();
  });
});
