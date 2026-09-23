import { commandExists, execCommand } from "./exec.js";

export interface SimctlDevice {
  name: string;
  udid: string;
  state: string;
  unavailable: boolean;
}

export async function simctlListDevices(): Promise<SimctlDevice[] | null> {
  if (!(await commandExists("xcrun"))) return null;
  try {
    const { stdout } = await execCommand("xcrun", ["simctl", "list", "devices", "-j"]);
    const parsed = JSON.parse(stdout) as {
      devices?: Record<string, Array<{ name: string; udid: string; state: string; isAvailable?: boolean }>>;
    };
    const out: SimctlDevice[] = [];
    for (const list of Object.values(parsed.devices ?? {})) {
      for (const d of list) {
        out.push({
          name: d.name,
          udid: d.udid,
          state: d.state,
          unavailable: d.isAvailable === false,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}
