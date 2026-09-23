import { commandExists, execCommand } from "./exec.js";

export async function npmCacheDir(): Promise<string | null> {
  if (!(await commandExists("npm"))) return null;
  try {
    const { stdout } = await execCommand("npm", ["config", "get", "cache"]);
    const dir = stdout.trim();
    return dir && dir !== "undefined" ? dir : null;
  } catch {
    return null;
  }
}

export async function yarnCacheDir(): Promise<string | null> {
  if (!(await commandExists("yarn"))) return null;
  try {
    const { stdout } = await execCommand("yarn", ["cache", "dir"]);
    const dir = stdout.trim();
    return dir.length > 0 ? dir : null;
  } catch {
    return null;
  }
}

export async function pnpmStorePath(): Promise<string | null> {
  if (!(await commandExists("pnpm"))) return null;
  try {
    const { stdout } = await execCommand("pnpm", ["store", "path"]);
    const dir = stdout.trim();
    return dir.length > 0 ? dir : null;
  } catch {
    return null;
  }
}

export async function pipCacheDir(): Promise<string | null> {
  const bin = (await commandExists("pip3")) ? "pip3" : (await commandExists("pip")) ? "pip" : null;
  if (!bin) return null;
  try {
    const { stdout } = await execCommand(bin, ["cache", "dir"]);
    const dir = stdout.trim();
    return dir.length > 0 ? dir : null;
  } catch {
    return null;
  }
}
