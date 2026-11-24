import os from "node:os";
import { allowShellDiscovery } from "../scanners/helpers.js";
import { currentMacOS, supportLevel, type MacOSVersion } from "./macos.js";
import { probeFullDiskAccess, runningApps } from "./probes.js";

export interface SystemDataContext {
  macos: MacOSVersion | null;
  support: "unsupported" | "verified" | "unverified";
  fda: "granted" | "denied" | "unknown";
  apps: { names: Set<string>; bundleIds: Set<string> };
  shell: boolean;
}

const cache = new Map<string, Promise<SystemDataContext>>();

async function build(root: string): Promise<SystemDataContext> {
  const macos = currentMacOS();
  const support = supportLevel(macos);
  if (!allowShellDiscovery(root)) {
    return { macos, support, fda: "unknown", apps: { names: new Set(), bundleIds: new Set() }, shell: false };
  }
  const [fda, apps] = await Promise.all([probeFullDiskAccess(os.homedir()), runningApps()]);
  return { macos, support, fda, apps, shell: true };
}

export function getSystemDataContext(root: string): Promise<SystemDataContext> {
  let p = cache.get(root);
  if (!p) {
    p = build(root);
    cache.set(root, p);
  }
  return p;
}

export function resetSystemDataContextForTests(): void {
  cache.clear();
}
