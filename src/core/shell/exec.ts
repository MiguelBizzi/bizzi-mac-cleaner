import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function execCommand(
  command: string,
  args: string[],
  opts: { timeout?: number; cwd?: string } = {},
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: opts.timeout ?? 15_000,
    cwd: opts.cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}
