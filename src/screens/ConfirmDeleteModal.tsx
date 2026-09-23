import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import type { DeleteFailure } from "../core/deleteItems.js";
import { isDryRun } from "../core/deleteSafely.js";
import {
  EMPTY_TRASH_CONFIRM_PHRASE,
  isEmptyTrashConfirm,
  matchesEmptyTrashConfirm,
} from "../core/emptyTrashConfirm.js";
import { formatBytes, truncatePath } from "../core/format.js";
import { t } from "../core/i18n.js";
import { dockerOrArchives } from "../core/selection.js";
import type { CleanupItem } from "../scanners/types.js";

export type ConfirmKind = "delete" | "emptyTrash";

export function ConfirmDeleteModal({
  items,
  phase,
  extraRequired,
  failures = [],
  kind = "delete",
  backTo = "list",
  onConfirm,
  onCancel,
  onMenu,
}: {
  items: CleanupItem[];
  phase: "confirm" | "deleting" | "done";
  extraRequired: boolean;
  failures?: DeleteFailure[];
  kind?: ConfirmKind;
  backTo?: "list" | "menu";
  onConfirm: () => void;
  onCancel: () => void;
  onMenu: () => void;
}): React.ReactElement {
  const bytes = useMemo(() => items.reduce((s, i) => s + i.sizeBytes, 0), [items]);
  const empty = isEmptyTrashConfirm(kind, items);
  const extra = extraRequired || dockerOrArchives(items) || empty;
  const size = formatBytes(bytes);
  const count = items.length;
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (phase !== "confirm") setTyped("");
  }, [phase]);

  useInput((input, key) => {
    if (phase === "done") {
      if (key.escape || key.return) {
        if (backTo === "menu") onMenu();
        else onCancel();
      }
      if (input === "m") onMenu();
      return;
    }
    if (phase !== "confirm") return;
    if (key.escape) {
      onCancel();
      return;
    }
    // Permanent Empty Trash requires typing the phrase — y/Enter must not suffice.
    if (empty) return;
    if (input === "n") onCancel();
    if (key.return || input === "y") onConfirm();
  });

  const nextHints = (
    <Box marginTop={1} flexDirection="column">
      {backTo === "menu" ? (
        <Text dimColor>{t("confirm.nextMenuOnly")}</Text>
      ) : (
        <>
          <Text dimColor>{t("confirm.nextList")}</Text>
          <Text dimColor>{t("confirm.nextMenu")}</Text>
        </>
      )}
    </Box>
  );

  if (phase === "done") {
    const failedCount = failures.length;
    const okCount = count;
    if (failedCount > 0 && okCount === 0) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
          <Text bold color="red">
            {t(empty ? "empty.fail" : "confirm.failTitle")}
          </Text>
          <Text>{t("confirm.failAll", { count: failedCount })}</Text>
          {failures.slice(0, 6).map((f) => (
            <Text key={f.item.id} dimColor>
              {truncatePath(f.item.path, 52)} — {f.error}
            </Text>
          ))}
          {nextHints}
        </Box>
      );
    }
    if (failedCount > 0) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">
            {t("confirm.partialTitle")}
          </Text>
          <Text>{t("confirm.partial", { size, count: okCount, failed: failedCount })}</Text>
          {failures.slice(0, 6).map((f) => (
            <Text key={f.item.id} dimColor>
              {truncatePath(f.item.path, 52)} — {f.error}
            </Text>
          ))}
          {nextHints}
        </Box>
      );
    }
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
        <Text bold color="green">
          {t("confirm.successTitle")}
        </Text>
        <Text>
          {empty
            ? t(isDryRun() ? "empty.successDryRun" : "empty.success", { size })
            : t(isDryRun() ? "confirm.successDryRun" : "confirm.success", { size, count })}
        </Text>
        {nextHints}
      </Box>
    );
  }

  if (phase === "deleting") {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">
          <Spinner type="dots" /> {t(empty ? "empty.deleting" : "confirm.deleting")}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {t(empty ? "empty.title" : "confirm.title")}
      </Text>
      {extra ? <Text color="red">{t(empty ? "empty.extra" : "confirm.extra")}</Text> : null}
      <Text>{t(empty ? "empty.summary" : "confirm.summary", { size, count })}</Text>
      {!empty
        ? items.slice(0, 8).map((item) => (
            <Text key={item.id} dimColor>
              {truncatePath(item.path, 56)}
            </Text>
          ))
        : null}
      {!empty && items.length > 8 ? (
        <Text dimColor>{t("confirm.more", { count: items.length - 8 })}</Text>
      ) : null}
      {empty ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">
            {t("empty.typePrompt", { phrase: EMPTY_TRASH_CONFIRM_PHRASE })}
          </Text>
          <Box>
            <Text dimColor>{"> "}</Text>
            <TextInput
              value={typed}
              onChange={setTyped}
              onSubmit={(value) => {
                if (matchesEmptyTrashConfirm(value)) onConfirm();
              }}
            />
          </Box>
          <Text dimColor>{t("empty.typeHint")}</Text>
        </Box>
      ) : (
        <Text dimColor>
          y / enter · {t("confirm.yes")}    n / esc · {t("confirm.no")}
        </Text>
      )}
    </Box>
  );
}
