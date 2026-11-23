import type { ScannerId } from "../scanners/types.js";

export type SafetyLevel = "safe" | "review" | "advisory" | "never";
export type TaxonomyGroup =
  | "user_caches"
  | "logs"
  | "web_data"
  | "developer"
  | "ai_models"
  | "device_backups"
  | "snapshots"
  | "virtualization"
  | "mail_messages"
  | "system_managed";

export interface SystemDataTarget {
  id: string; // e.g. "caches.app"; i18n keys are sd.<id>.<field>
  group: TaxonomyGroup;
  safety: SafetyLevel;
  /** "/"-separated. Relative = under the scan root (home). Absolute ("/…") = documentation/deny only.
   *  Segment "*" = any one segment; a glob inside a segment ("com.apple.*", "*.ipsw") matches within it;
   *  "<uuid>" = a UUID segment; a trailing "**" = this path and everything under it (never targets only). */
  patterns: string[];
  /** Segment globs that a "*" in `patterns` must not match. */
  exclude?: string[];
  /** Documented here, scanned and deleted under another scanner's category. */
  ownedBy?: ScannerId;
  macos?: { min?: string; max?: string };
  /** "required": skip unless FDA granted. { fromMacOS }: required only on that version and later. */
  fda?: "required" | { fromMacOS: string };
  /** How to tell the owning app is running. "bundleIdFolder": the first "*" segment is a bundle id.
   *  "folderName": the first "*" segment is an app name (match process basename, prefix match for "<name> Helper"). */
  runningCheck?: "bundleIdFolder" | "folderName" | { names: string[] };
  /** Directory matched by the first "*" must contain one of these entries (e.g. Chromium userData markers). */
  markerAnyOf?: string[];
  /** Advisory only: shown verbatim, never executed. */
  commands?: string[];
  sources: string[];
}
