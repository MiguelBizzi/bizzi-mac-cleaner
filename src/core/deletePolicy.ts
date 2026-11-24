import path from "node:path";
import { fs } from "./fs.js";
import en from "../locales/en.json" with { type: "json" };
import { findDeletableTarget, findNeverTarget, targetById } from "../systemData/catalog.js";
import { currentMacOS, inRange, supportLevel } from "../systemData/macos.js";
import { relSegments } from "../systemData/match.js";
import { isInsidePackage, pathsToAudit } from "./paths.js";

const enText = (key: string): string => (en as Record<string, string>)[key] ?? key;

function realRoot(root: string): string {
  try {
    return fs.realpathSync(path.resolve(root));
  } catch {
    return path.resolve(root);
  }
}

/** Never-list refusal (English text) for the lexical path and its real location; null when clear. */
function neverViolation(target: string, root: string): string | null {
  const roots = [path.resolve(root), realRoot(root)];
  for (const p of pathsToAudit(target)) {
    // A real path outside the root has no relative form: only absolute patterns can match it.
    const rel = roots.map((r) => relSegments(r, p)).find((r): r is string[] => r !== null) ?? [];
    const hit = findNeverTarget(rel, p);
    if (hit) return `"${enText(`sd.${hit.id}.label`)}" is never removed: ${enText(`sd.${hit.id}.why`)}`;
  }
  return null;
}

function systemDataViolation(target: string, root: string): string | null {
  const [lexical, real = lexical] = pathsToAudit(target) as [string, string?];
  const lexRel = relSegments(path.resolve(root), lexical);
  const realRel = relSegments(realRoot(root), real) ?? relSegments(path.resolve(root), real);
  const lexHit = lexRel ? findDeletableTarget(lexRel) : undefined;
  if (!lexHit) return `path is not a System Data cleanup target`;
  const realHit = realRel ? findDeletableTarget(realRel) : undefined;
  if (!realHit || realHit.id !== lexHit.id) return `real location differs from the System Data target "${lexHit.id}"`;
  const entry = targetById(lexHit.id);
  const version = currentMacOS();
  if (supportLevel(version) === "unsupported") return "this macOS version is unsupported for system_data cleanup";
  if (!entry || !inRange(version, entry.macos)) return `target "${lexHit.id}" does not apply to this macOS version`;
  return null;
}

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
  trash_bin: [eq(".Trash")],
};

/** Returns a refusal reason, or null when the path is allowed for this category. */
export function categoryViolation(category: string, target: string, root: string): string | null {
  const resolved = path.resolve(target);
  const relPath = path.relative(path.resolve(root), resolved);
  if (relPath === "" || relPath.startsWith("..")) return "path is outside the scan root";
  const rel = relPath.split(path.sep);

  // Hard-deny wins over every allow rule, for every category.
  const never = neverViolation(target, root);
  if (never) return never;

  if (category === "system_data") return systemDataViolation(target, root);

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
