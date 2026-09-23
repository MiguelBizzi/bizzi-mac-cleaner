export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function daysAgo(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function sizeBar(bytes: number, maxBytes: number, width = 14): string {
  if (width <= 0 || maxBytes <= 0 || bytes <= 0) return "░".repeat(Math.max(0, width));
  const filled = Math.min(width, Math.max(1, Math.round((bytes / maxBytes) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function truncatePath(p: string, max = 48): string {
  if (max <= 1 || p.length <= max) return p;
  return `…${p.slice(p.length - (max - 1))}`;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Pull the Finder / trash message out of a Node child_process error. */
export function formatTrashError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const finder = lines.find((l) =>
    /don.?t have permission|couldn.?t be moved|cannot be deleted|in use|operation not permitted/i.test(
      l,
    ),
  );
  if (finder) return finder;
  const last = lines.at(-1);
  if (last && !last.startsWith("Command failed")) return last;
  return "Could not move this item to Trash.";
}
