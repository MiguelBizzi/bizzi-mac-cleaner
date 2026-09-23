import os from "node:os";
import path from "node:path";
import { formatTrashError } from "./format.js";
import { appendHistory } from "./history.js";
import {
  isAppConfigPath,
  isGitInternal,
  isInsideRoot,
  isProtectedPath,
  pathsToAudit,
} from "./paths.js";
import { execCommand } from "./shell/exec.js";

export class UnsafeDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDeleteError";
  }
}

let dryRunOverride: boolean | undefined;

export function setDryRun(value: boolean | undefined): void {
  dryRunOverride = value;
}

export function isDryRun(): boolean {
  if (dryRunOverride !== undefined) return dryRunOverride;
  const env = process.env.BIZZI_DRY_RUN?.toLowerCase();
  return env === "1" || env === "true" || env === "yes";
}

export function assertSafeToDelete(target: string, root: string): void {
  const resolvedRoot = path.resolve(root);
  for (const resolved of pathsToAudit(target)) {
    if (resolved === resolvedRoot) {
      throw new UnsafeDeleteError("refusing to delete the scan root");
    }
    if (!isInsideRoot(resolved, resolvedRoot)) {
      throw new UnsafeDeleteError("path is outside the scan root");
    }
    if (isGitInternal(resolved)) {
      throw new UnsafeDeleteError("refusing to delete git internals");
    }
    if (isAppConfigPath(resolved)) {
      throw new UnsafeDeleteError("refusing to delete app config");
    }
    if (isProtectedPath(resolved)) {
      throw new UnsafeDeleteError("refusing to delete a protected path");
    }
  }
}

export interface DeleteRequest {
  path: string;
  sizeBytes: number;
  category: string;
  root: string;
}

export type DeleteOutcome =
  | { ok: true; dryRun: boolean }
  | { ok: false; dryRun: boolean; error: string };

function fail(error: unknown, dryRun: boolean): DeleteOutcome {
  return { ok: false, dryRun, error: formatTrashError(error) };
}

/**
 * Send a path to the macOS Trash. Never calls fs.rm / rimraf.
 * When dry-run is active (BIZZI_DRY_RUN or setDryRun(true)), logs the would-be
 * delete and records history without calling `trash()`.
 * Trash / permission failures are returned, not thrown — the TUI must stay up.
 */
export async function deleteSafely(req: DeleteRequest): Promise<DeleteOutcome> {
  try {
    assertSafeToDelete(req.path, req.root);
  } catch (err) {
    return fail(err, isDryRun());
  }
  const dryRun = isDryRun();
  const entry = {
    at: new Date().toISOString(),
    path: req.path,
    sizeBytes: req.sizeBytes,
    category: req.category,
    dryRun,
  };

  if (dryRun) {
    // Never print to stdout while the TUI owns the TTY — it desyncs Ink's frame.
    if (!process.stdout.isTTY) {
      console.log(
        `[dry-run] would trash ${req.path} (${req.sizeBytes} bytes, ${req.category})`,
      );
    }
    await appendHistory(entry);
    return { ok: true, dryRun: true };
  }

  try {
    const trash = (await import("trash")).default;
    await trash([req.path]);
    await appendHistory(entry);
    return { ok: true, dryRun: false };
  } catch (err) {
    return fail(err, false);
  }
}

/**
 * Emptying Trash is the one permanent action (files are already in Trash).
 * Dry-run still only logs. Real ~/.Trash uses Finder; fixture trees go through `trash()`.
 */
export async function emptyTrash(req: DeleteRequest): Promise<DeleteOutcome> {
  try {
    assertSafeToDelete(req.path, req.root);
  } catch (err) {
    return fail(err, isDryRun());
  }
  const dryRun = isDryRun();
  const entry = {
    at: new Date().toISOString(),
    path: req.path,
    sizeBytes: req.sizeBytes,
    category: req.category,
    dryRun,
  };
  if (dryRun) {
    if (!process.stdout.isTTY) {
      console.log(`[dry-run] would empty trash at ${req.path} (${req.sizeBytes} bytes)`);
    }
    await appendHistory(entry);
    return { ok: true, dryRun: true };
  }
  const realTrash = path.join(os.homedir(), ".Trash");
  if (path.resolve(req.path) === path.resolve(realTrash)) {
    try {
      await execCommand("osascript", ["-e", "tell application \"Finder\" to empty the trash"]);
      await appendHistory(entry);
      return { ok: true, dryRun: false };
    } catch (err) {
      return fail(err, false);
    }
  }
  return deleteSafely(req);
}
