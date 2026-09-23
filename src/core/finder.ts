import { execCommand } from "./shell/exec.js";

export async function revealInFinder(target: string): Promise<void> {
  await execCommand("open", ["-R", target]);
}
