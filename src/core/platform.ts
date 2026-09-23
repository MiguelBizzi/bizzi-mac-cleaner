export function assertMacOS(): void {
  if (process.platform !== "darwin") {
    console.error("Bizzi Mac Cleaner is macOS-only for now.");
    process.exit(1);
  }
}
