import path from "node:path";
import { fs } from "./fs.js";
import { isInsidePackage } from "./paths.js";

/**
 * Per-category allowlist. A path may only be trashed if it matches the shape its
 * scanner is allowed to produce. This is defence in depth: even if a scanner is
 * buggy or its output is tampered with, `~/Documents` can never be trashed as
 * an "npm cache". Unknown categories are refused.
 */

type Rule = (rel: string[]) => boolean;

const eq = (...segs: string[]): Rule => (rel) =>
  rel.length === segs.length && segs.every((s, i) => rel[i] === s);

const under = (...segs: string[]): Rule => (rel) =>
  rel.length > segs.length && segs.every((s, i) => rel[i] === s);

const anySegment = (re: RegExp): Rule => (rel) => rel.length > 0 && rel.some((s) => re.test(s));

const SYSTEM_CACHE_RULES: Rule[] = [
  (rel) => rel.length === 3 && rel[0] === "Library" && rel[1] === "Caches",
  eq("Library", "Logs"),
  eq("Library", "Safari", "Favicon Cache"),
  eq("Library", "HTTPStorages"),
  eq("Library", "WebKit"),
  eq("Library", "Developer", "Xcode", "iOS DeviceSupport"),
  eq("Library", "Developer", "Xcode", "watchOS DeviceSupport"),
  eq("Library", "Developer", "Xcode", "tvOS DeviceSupport"),
  eq("Library", "Developer", "Xcode", "UserData", "Previews"),
];

const RULES: Record<string, Rule[]> = {
  node_modules: [(rel) => rel.length >= 1 && rel[rel.length - 1] === "node_modules"],
  npm_cache: [anySegment(/^(\.npm|_cacache|npm)$|npm/i)],
  yarn_cache: [anySegment(/yarn/i)],
  pnpm_cache: [anySegment(/pnpm/i)],
  brew_cache: [anySegment(/homebrew|linuxbrew/i)],
  pip_cache: [anySegment(/^pip$|pip/i)],
  cargo_cache: [under(".cargo", "registry")],
  cocoapods_cache: [eq("Library", "Caches", "CocoaPods")],
  gradle_cache: [eq(".gradle", "caches")],
  xcode_derived_data: [eq("Library", "Developer", "Xcode", "DerivedData")],
  xcode_archives: [eq("Library", "Developer", "Xcode", "Archives")],
  simulator_caches: [
    eq("Library", "Developer", "CoreSimulator", "Caches"),
    (rel) =>
      rel.length === 5 &&
      rel[0] === "Library" &&
      rel[1] === "Developer" &&
      rel[2] === "CoreSimulator" &&
      rel[3] === "Devices" &&
      /^[0-9A-F-]{36}$/i.test(rel[4] ?? ""),
  ],
  docker_unused: [
    eq("Library", "Caches", "com.docker.docker"),
    eq("Library", "Caches", "Docker Desktop"),
    eq("Library", "Containers", "com.docker.docker", "Data", "log"),
  ],
  system_caches_logs: SYSTEM_CACHE_RULES,
  trash_bin: [eq(".Trash")],
};

/** Returns a refusal reason, or null when the path is allowed for this category. */
export function categoryViolation(category: string, target: string, root: string): string | null {
  const resolved = path.resolve(target);
  const relPath = path.relative(path.resolve(root), resolved);
  if (relPath === "" || relPath.startsWith("..")) return "path is outside the scan root";
  const rel = relPath.split(path.sep);

  if (category === "largest_files") {
    if (rel.includes("Library")) return "files inside ~/Library are never offered as large files";
    if (isInsidePackage(resolved)) return "path is inside a macOS package (app/library bundle)";
    try {
      if (!fs.lstatSync(resolved).isFile()) return "only regular files can be removed as large files";
    } catch {
      // vanished or unreadable: the trash call will report it
    }
    return null;
  }

  const rules = RULES[category];
  if (!rules) return `unknown cleanup category "${category}"`;
  if (!rules.some((rule) => rule(rel))) return `path does not match what "${category}" may remove`;
  return null;
}
