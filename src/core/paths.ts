import os from "node:os";
import path from "node:path";
import { fs, fsp } from "./fs.js";

export function configDir(): string {
  return path.join(os.homedir(), ".config", "bizzi-mac-cleaner");
}

export function historyPath(): string {
  return path.join(configDir(), "history.json");
}

export function resolveRoot(explicit?: string, configured?: string): string {
  return path.resolve(explicit ?? configured ?? os.homedir());
}

/** Lexical path plus realpath when the file exists (catches symlink escapes). */
export function pathsToAudit(target: string): string[] {
  const lexical = path.resolve(target);
  try {
    const real = fs.realpathSync(lexical);
    return real === lexical ? [lexical] : [lexical, real];
  } catch {
    return [lexical];
  }
}

/** macOS "packages": directories that are one logical document/library. Never offer their innards. */
export const PACKAGE_EXTENSIONS = new Set([
  "app", "photoslibrary", "sparsebundle", "utm", "fcpbundle", "logicx", "tvlibrary",
  "imovielibrary", "musiclibrary", "band", "framework", "bundle", "vmwarevm", "pvm",
  "vbox", "xcodeproj", "xcworkspace", "playground", "rtfd", "pages", "numbers", "key",
  "scriv", "lrdata", "cocatalog", "sketchlibrary", "photolibrary", "aplibrary", "theater",
  "plugin", "kext", "xcarchive", "xcassets",
]);

export function isPackageName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return PACKAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function isInsidePackage(target: string): boolean {
  return path.resolve(target).split(path.sep).some(isPackageName);
}

export function isInsideRoot(target: string, root: string): boolean {
  const resolved = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

export function isGitInternal(target: string): boolean {
  return path.resolve(target).split(path.sep).includes(".git");
}

export function isAppConfigPath(target: string): boolean {
  const dir = path.resolve(configDir());
  const resolved = path.resolve(target);
  return resolved === dir || resolved.startsWith(dir + path.sep);
}

/** Path segments that must never be sent to Trash, wherever they appear. */
const PROTECTED_SEGMENTS = new Set([".ssh", ".gnupg", ".aws", ".kube", "Keychains"]);

/** macOS system prefixes that must never be deleted, even if --root is broad. */
const SYSTEM_PREFIXES = [
  "/System",
  "/bin",
  "/sbin",
  "/usr",
  "/etc",
  "/dev",
  "/Library",
  "/Applications",
  "/Volumes",
  "/opt",
  "/cores",
  "/Network",
  "/private/etc",
  "/private/var",
];

/**
 * True for paths the tool must never trash: system dirs, the user's home
 * directory itself, and secrets (SSH, GPG, cloud creds, keychains).
 */
export function isProtectedPath(target: string): boolean {
  const resolved = path.resolve(target);
  if (resolved === path.sep || resolved === path.resolve(os.homedir())) return true;
  for (const prefix of SYSTEM_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(prefix + path.sep)) return true;
  }
  return path.resolve(target).split(path.sep).some((part) => PROTECTED_SEGMENTS.has(part));
}

/**
 * Scan roots that would let the tool walk the whole machine or a system tree.
 * `$HOME` is allowed (it is the default). `/tmp` is allowed for fixtures.
 */
export function isSafeScanRoot(root: string): boolean {
  const resolved = path.resolve(root);
  if (resolved === path.sep || resolved === "/Users") return false;
  if (resolved === path.resolve(os.homedir())) return true;
  if (resolved === "/tmp" || resolved.startsWith(`/tmp${path.sep}`)) return true;
  if (resolved === "/private/tmp" || resolved.startsWith(`/private/tmp${path.sep}`)) return true;
  if (isProtectedPath(resolved)) return false;
  return true;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function statSafe(target: string): Promise<{ size: number; mtime: Date; isDirectory: boolean } | null> {
  try {
    const st = await fsp.lstat(target);
    return { size: st.size, mtime: st.mtime, isDirectory: st.isDirectory() };
  } catch {
    return null;
  }
}

export function itemId(category: string, target: string): string {
  return `${category}:${target}`;
}
