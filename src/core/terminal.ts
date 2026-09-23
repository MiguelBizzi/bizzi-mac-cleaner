import type { WriteStream } from "node:tty";

/** Wipe the terminal so a shorter Ink frame cannot leave the previous screen behind. */
export function clearScreen(stream: WriteStream | NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) return;
  stream.write("\x1b[2J\x1b[3J\x1b[H");
}
