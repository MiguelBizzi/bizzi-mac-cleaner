import os from "node:os";
import path from "node:path";
import Conf from "conf";
import { fs } from "./fs.js";
import { configDir, isSafeScanRoot, resolveRoot } from "./paths.js";

export interface AppConfig {
  locale: string;
  staleDays: number;
  scanRoot: string;
  confirmEveryDelete: boolean;
  largestFilesCount: number;
  /** Set once the user has explicitly opted in to live mode (--no-dry-run). */
  liveEnabled: boolean;
  /** Check the npm registry for a newer version on launch. */
  updateCheck: boolean;
}

const defaults: AppConfig = {
  locale: "en",
  staleDays: 30,
  scanRoot: os.homedir(),
  confirmEveryDelete: false,
  largestFilesCount: 100,
  liveEnabled: false,
  updateCheck: true,
};

let store: Conf<AppConfig> | undefined;

function hardenConfigDir(): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.chmodSync(configDir(), 0o700);
    const cfg = path.join(configDir(), "config.json");
    if (fs.existsSync(cfg)) fs.chmodSync(cfg, 0o600);
  } catch {
    // ignore — first run or a test FS that cannot chmod
  }
}

function getStore(): Conf<AppConfig> {
  if (!store) {
    store = new Conf<AppConfig>({
      projectName: "bizzi-mac-cleaner",
      cwd: configDir(),
      configName: "config",
      defaults,
    });
    hardenConfigDir();
  }
  return store;
}

export function loadConfig(): AppConfig {
  const s = getStore();
  const scanRoot = s.get("scanRoot");
  return {
    locale: s.get("locale"),
    staleDays: s.get("staleDays"),
    scanRoot: isSafeScanRoot(scanRoot) ? scanRoot : os.homedir(),
    confirmEveryDelete: s.get("confirmEveryDelete"),
    largestFilesCount: s.get("largestFilesCount"),
    liveEnabled: s.get("liveEnabled"),
    updateCheck: s.get("updateCheck"),
  };
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const s = getStore();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "scanRoot" && typeof value === "string" && !isSafeScanRoot(value)) {
      continue;
    }
    s.set(key as keyof AppConfig, value);
  }
  hardenConfigDir();
  return loadConfig();
}

export function scanRootFrom(cliRoot: string | undefined, config = loadConfig()): string {
  return resolveRoot(cliRoot, config.scanRoot);
}

export function resetConfigStoreForTests(): void {
  store = undefined;
}
