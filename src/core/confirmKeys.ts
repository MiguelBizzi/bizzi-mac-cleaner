export type ConfirmKeyAction = "confirm" | "cancel" | null;

/**
 * Key decision for the delete-confirm modal. Enter must NEVER confirm: it opens
 * the modal, so a stray or held Enter would delete. Only an explicit `y` does,
 * which also covers items that need extra confirmation.
 */
export function confirmKeyAction(
  input: string,
  key: { return: boolean; escape: boolean },
): ConfirmKeyAction {
  if (key.escape || input === "n") return "cancel";
  if (key.return) return null;
  return input === "y" ? "confirm" : null;
}
