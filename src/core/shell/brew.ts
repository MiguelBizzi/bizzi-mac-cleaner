import { commandExists, execCommand } from "./exec.js";

export async function brewCacheDir(): Promise<string | null> {
  if (!(await commandExists("brew"))) return null;
  try {
    const { stdout } = await execCommand("brew", ["--cache"]);
    const dir = stdout.trim();
    return dir.length > 0 ? dir : null;
  } catch {
    return null;
  }
}

export async function brewCleanupDryRun(): Promise<string | null> {
  if (!(await commandExists("brew"))) return null;
  try {
    const { stdout, stderr } = await execCommand("brew", ["cleanup", "-n"]);
    return `${stdout}\n${stderr}`.trim();
  } catch {
    return null;
  }
}
