import { t } from "./i18n.js";
import { systemDataPreflight } from "../systemData/preflight.js";
import { runningApps, type RunningApps } from "../systemData/probes.js";
import { allowShellDiscovery } from "../scanners/helpers.js";
import type { CleanupItem } from "../scanners/types.js";
import { deleteSafely, emptyTrash, type DeleteRequest } from "./deleteSafely.js";

export interface DeleteFailure {
  item: CleanupItem;
  error: string;
}

export interface DeleteBatchResult {
  succeeded: CleanupItem[];
  failed: DeleteFailure[];
  /** Items left untouched because the user interrupted the run (Ctrl+C / SIGTERM). */
  notStarted: CleanupItem[];
}

let stopRequested = false;
const inFlight = new Set<Promise<unknown>>();

/** Ask running delete batches to stop after the item currently being trashed. */
export function requestStopDeleting(): void {
  stopRequested = true;
}

export function resetStopForTests(): void {
  stopRequested = false;
}

export function hasInFlightDeletes(): boolean {
  return inFlight.size > 0;
}

/** Resolves once every in-flight batch has finished its current item. */
export async function drainDeletes(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

export function deleteItems(
  items: CleanupItem[],
  root: string,
  onItem?: (item: CleanupItem) => void,
): Promise<DeleteBatchResult> {
  const run = runBatch(items, root, onItem);
  inFlight.add(run);
  const done = () => inFlight.delete(run);
  void run.then(done, done);
  return run;
}

async function runBatch(
  items: CleanupItem[],
  root: string,
  onItem?: (item: CleanupItem) => void,
): Promise<DeleteBatchResult> {
  const succeeded: CleanupItem[] = [];
  const failed: DeleteFailure[] = [];
  const notStarted: CleanupItem[] = [];
  // One probe per batch, fresh (never the scan-time cache): the delete-time check of running apps.
  let appsOnce: Promise<RunningApps> | undefined;
  const apps = (): Promise<RunningApps> => (appsOnce ??= allowShellDiscovery(root)
    ? runningApps()
    : Promise.resolve({ names: new Set<string>(), bundleIds: new Set<string>(), ok: true }));
  for (const item of items) {
    if (stopRequested) {
      notStarted.push(item);
      continue;
    }
    // Second wall: the selection layer already blocks advisories, whatever their category.
    if (item.advisory === true) {
      failed.push({ item, error: t("sd.preflight.advisory") });
      continue;
    }
    if (item.category === "system_data") {
      const refusal = await systemDataPreflight(item, root, apps);
      if (refusal !== null) {
        failed.push({ item, error: refusal });
        continue;
      }
    }
    const req: DeleteRequest = {
      path: item.path,
      sizeBytes: item.sizeBytes,
      category: item.category,
      root,
    };
    const outcome = item.category === "trash_bin" ? await emptyTrash(req) : await deleteSafely(req);
    if (outcome.ok) {
      succeeded.push(item);
      onItem?.(item);
    } else {
      failed.push({ item, error: outcome.error });
    }
  }
  return { succeeded, failed, notStarted };
}
