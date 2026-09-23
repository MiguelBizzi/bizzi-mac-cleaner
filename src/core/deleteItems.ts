import type { CleanupItem } from "../scanners/types.js";
import { deleteSafely, emptyTrash, type DeleteRequest } from "./deleteSafely.js";

export interface DeleteFailure {
  item: CleanupItem;
  error: string;
}

export interface DeleteBatchResult {
  succeeded: CleanupItem[];
  failed: DeleteFailure[];
}

export async function deleteItems(
  items: CleanupItem[],
  root: string,
  onItem?: (item: CleanupItem) => void,
): Promise<DeleteBatchResult> {
  const succeeded: CleanupItem[] = [];
  const failed: DeleteFailure[] = [];
  for (const item of items) {
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
  return { succeeded, failed };
}
