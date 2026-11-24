import os from "node:os";
import { allowShellDiscovery } from "../scanners/helpers.js";
import { currentMacOS, supportLevel, type MacOSVersion } from "./macos.js";
import { probeFullDiskAccess, runningApps, type RunningApps } from "./probes.js";

export interface SystemDataContext {
  macos: MacOSVersion | null;
  support: "unsupported" | "verified" | "unverified";
  fda: "granted" | "denied" | "unknown";
  /** Fixture roots (shell:false) probe nothing, so apps is empty with ok:true: there is no evidence of running apps. */
  apps: RunningApps;
  shell: boolean;
}

const cache = new Map<string, Promise<SystemDataContext>>();

async function build(root: string): Promise<SystemDataContext> {
  const macos = currentMacOS();
  const support = supportLevel(macos);
  if (!allowShellDiscovery(root)) {
    return { macos, support, fda: "unknown", apps: { names: new Set(), bundleIds: new Set(), ok: true }, shell: false };
  }
  const [fda, apps] = await Promise.all([probeFullDiskAccess(os.homedir()), runningApps()]);
  return { macos, support, fda, apps, shell: true };
}

export function getSystemDataContext(root: string): Promise<SystemDataContext> {
  let p = cache.get(root);
  if (!p) {
    const attempt: Promise<SystemDataContext> = build(root).catch(() => {
      if (cache.get(root) === attempt) cache.delete(root);
      return {
        macos: null,
        support: "unverified" as const,
        fda: "unknown" as const,
        apps: { names: new Set<string>(), bundleIds: new Set<string>(), ok: false },
        shell: false,
      };
    });
    p = attempt;
    cache.set(root, p);
  }
  return p;
}

export function resetSystemDataContextForTests(): void {
  cache.clear();
}
