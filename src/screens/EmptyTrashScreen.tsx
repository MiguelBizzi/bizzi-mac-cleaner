import os from "node:os";
import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { useAppContext } from "../app.js";
import { deleteItems, type DeleteFailure } from "../core/deleteItems.js";
import { t } from "../core/i18n.js";
import { trashBinScanner } from "../scanners/trashBin.js";
import type { CleanupItem } from "../scanners/types.js";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal.js";

export function EmptyTrashScreen(): React.ReactElement {
  const { navigate } = useAppContext();
  const home = os.homedir();
  const [item, setItem] = useState<CleanupItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"confirm" | "deleting" | "done">("confirm");
  const [failures, setFailures] = useState<DeleteFailure[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        for await (const found of trashBinScanner.scan({
          root: home,
          staleDays: 30,
          signal: ac.signal,
        })) {
          if (!ac.signal.aborted) setItem(found);
        }
      } catch {
        // One unreadable directory must not reject this floating task and kill the process.
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [home]);

  useInput((_input, key) => {
    if (item) return;
    if (key.escape || key.return) navigate("menu");
  });

  const runEmpty = async () => {
    if (!item) return;
    setPhase("deleting");
    const result = await deleteItems([item], home);
    setFailures(result.failed);
    setPhase("done");
  };

  if (loading) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" /> {t("empty.measuring")}
        </Text>
      </Box>
    );
  }

  if (!item) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
        <Text color="green">{t("empty.alreadyEmpty")}</Text>
        <Box marginTop={1}>
          <Text dimColor>{t("confirm.nextMenuOnly")}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <ConfirmDeleteModal
      items={phase === "done" ? (failures.length > 0 ? [] : [item]) : [item]}
      phase={phase}
      extraRequired={true}
      failures={failures}
      kind="emptyTrash"
      backTo="menu"
      onConfirm={() => void runEmpty()}
      onCancel={() => navigate("menu")}
      onMenu={() => navigate("menu")}
    />
  );
}
