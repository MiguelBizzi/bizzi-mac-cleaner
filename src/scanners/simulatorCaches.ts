import path from "node:path";
import { simctlListDevices } from "../core/shell/xcrun.js";
import { allowShellDiscovery, yieldEachExistingDir, yieldFirstExistingDir } from "./helpers.js";
import type { Scanner } from "./types.js";

const DEVICES_DIR = ["Library", "Developer", "CoreSimulator", "Devices"] as const;

export const simulatorCachesScanner: Scanner = {
  id: "simulator_caches",
  labelKey: "scanners.simulatorCaches",
  async *scan(options) {
    yield* yieldFirstExistingDir(options, {
      category: "simulator_caches",
      candidates: [path.join(options.root, "Library", "Developer", "CoreSimulator", "Caches")],
      risk: "safe",
      description: "CoreSimulator Caches",
    });

    if (!allowShellDiscovery(options.root)) return;
    const devices = await simctlListDevices();
    if (!devices) return;
    const unused = devices.filter((d) => d.unavailable || d.state === "Shutdown");
    const candidates = unused.map((d) =>
      path.join(options.root, ...DEVICES_DIR, d.udid),
    );
    yield* yieldEachExistingDir(options, {
      category: "simulator_caches",
      candidates,
      risk: "caution",
      describe: (p) => `Simulator ${path.basename(p)}`,
    });
  },
};
