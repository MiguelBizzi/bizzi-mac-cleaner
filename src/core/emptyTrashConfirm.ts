/** Phrase the user must type to empty Trash. Keep untranslated — it is a command. */
export const EMPTY_TRASH_CONFIRM_PHRASE = "empty";

export function isEmptyTrashConfirm(
  kind: "delete" | "emptyTrash",
  items: ReadonlyArray<{ category: string }>,
): boolean {
  return kind === "emptyTrash" || items.some((item) => item.category === "trash_bin");
}

export function matchesEmptyTrashConfirm(typed: string): boolean {
  return typed.trim().toLowerCase() === EMPTY_TRASH_CONFIRM_PHRASE;
}
