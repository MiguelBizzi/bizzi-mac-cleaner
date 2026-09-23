import { fsp } from "./fs.js";
import { configDir, historyPath } from "./paths.js";

/** Keep history bounded so a long-lived install cannot grow without limit. */
const HISTORY_MAX_ENTRIES = 500;

export interface HistoryEntry {
  at: string;
  path: string;
  sizeBytes: number;
  category: string;
  dryRun: boolean;
}

interface HistoryFile {
  entries: HistoryEntry[];
}

async function readHistory(): Promise<HistoryFile> {
  try {
    const raw = await fsp.readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as HistoryFile;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  await fsp.mkdir(configDir(), { recursive: true, mode: 0o700 });
  try {
    await fsp.chmod(configDir(), 0o700);
  } catch {
    // chmod can fail on some test FS mocks; the write still proceeds
  }
  const file = await readHistory();
  file.entries.push(entry);
  if (file.entries.length > HISTORY_MAX_ENTRIES) {
    file.entries = file.entries.slice(-HISTORY_MAX_ENTRIES);
  }
  const dest = historyPath();
  await fsp.writeFile(dest, JSON.stringify(file, null, 2), { mode: 0o600 });
  try {
    await fsp.chmod(dest, 0o600);
  } catch {
    // same as mkdir chmod — ignore on mocks that lack chmod
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  return (await readHistory()).entries;
}
