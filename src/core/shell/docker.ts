import { commandExists, execCommand } from "./exec.js";

export async function dockerSystemDf(): Promise<string | null> {
  if (!(await commandExists("docker"))) return null;
  try {
    const { stdout } = await execCommand("docker", ["system", "df"]);
    return stdout.trim();
  } catch {
    return null;
  }
}
