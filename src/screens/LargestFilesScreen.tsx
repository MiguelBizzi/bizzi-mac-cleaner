import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { useAppContext } from "../app.js";
import { deleteItems, type DeleteFailure } from "../core/deleteItems.js";
import { revealInFinder } from "../core/finder.js";
import { formatBytes, isoDate, sizeBar, truncatePath } from "../core/format.js";
import { t } from "../core/i18n.js";
import { followScroll, moveCursor } from "../core/scanView.js";
import {
  checkGlyph,
  listCheckState,
  needsExtraConfirm,
  selectedItems,
  selectedTotal,
  toggleAll,
  toggleId,
} from "../core/selection.js";
import { clearScreen } from "../core/terminal.js";
import { TopN } from "../core/topN.js";
import { largestFilesScanner } from "../scanners/index.js";
import type { CleanupItem } from "../scanners/types.js";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal.js";

const HEADER_CHROME = 11;
const BAR_WIDTH = 16;

export function LargestFilesScreen(): React.ReactElement {
  const { root, config, navigate } = useAppContext();
  const { stdout } = useStdout();
  const n = config.largestFilesCount;
  const topRef = useRef(new TopN<CleanupItem>(n, (item) => item.sizeBytes));
  const [items, setItems] = useState<CleanupItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [phase, setPhase] = useState<"list" | "confirm" | "deleting" | "done">("list");
  const [pending, setPending] = useState<CleanupItem[]>([]);
  const [failures, setFailures] = useState<DeleteFailure[]>([]);

  const rowCount = items.length + 1;
  const listHeight = Math.max(6, (stdout.rows || 24) - HEADER_CHROME);

  useEffect(() => {
    const ac = new AbortController();
    topRef.current = new TopN<CleanupItem>(n, (item) => item.sizeBytes);
    void (async () => {
      try {
        for await (const item of largestFilesScanner.scan({
          root,
          staleDays: config.staleDays,
          largestFilesCount: n,
          signal: ac.signal,
        })) {
          topRef.current.push(item);
          setItems(topRef.current.toArray());
        }
      } finally {
        if (!ac.signal.aborted) setDone(true);
      }
    })();
    return () => ac.abort();
  }, [root, config.staleDays, n]);

  useEffect(() => {
    setCursor((c) => moveCursor(c, 0, rowCount));
    setScroll((s) => followScroll(s, cursor, rowCount, listHeight));
  }, [cursor, rowCount, listHeight]);

  const backToList = () => {
    clearScreen(stdout);
    setPhase("list");
    setFailures([]);
  };

  useInput((input, key) => {
    if (phase !== "list") return;
    if (key.escape) {
      navigate("menu");
      return;
    }
    if (key.upArrow) {
      setCursor((c) => moveCursor(c, -1, rowCount));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => moveCursor(c, 1, rowCount));
      return;
    }
    if (input === "a") {
      setSelected((prev) => toggleAll(items, prev));
      return;
    }
    if (input === " ") {
      if (cursor === 0) {
        setSelected((prev) => toggleAll(items, prev));
      } else {
        const item = items[cursor - 1];
        if (item) setSelected((prev) => toggleId(prev, item.id));
      }
      return;
    }
    const focused = cursor === 0 ? items[0] : items[cursor - 1];
    if (input === "o" && focused) {
      void revealInFinder(focused.path);
      return;
    }
    if (key.return || input === "d") {
      const chosen = selectedItems(items, selected);
      let toDelete = chosen;
      if (toDelete.length === 0) {
        if (cursor === 0) toDelete = items;
        else {
          const item = items[cursor - 1];
          if (item) toDelete = [item];
        }
      }
      if (toDelete.length === 0) return;
      setPending(toDelete);
      clearScreen(stdout);
      setPhase("confirm");
    }
  });

  const confirm = async () => {
    setPhase("deleting");
    const result = await deleteItems(pending, root);
    const ids = new Set(result.succeeded.map((i) => i.id));
    setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setCursor(0);
    setPending(result.succeeded);
    setFailures(result.failed);
    clearScreen(stdout);
    setPhase("done");
  };

  const totals = selectedTotal(items, selected);
  const maxBytes = items[0]?.sizeBytes ?? 0;
  const cols = stdout.columns || 80;
  const pathWidth = Math.max(24, cols - 48);

  if (phase !== "list") {
    return (
      <ConfirmDeleteModal
        items={pending}
        phase={phase === "confirm" ? "confirm" : phase}
        extraRequired={needsExtraConfirm(pending)}
        failures={failures}
        onConfirm={() => void confirm()}
        onCancel={backToList}
        onMenu={() => navigate("menu")}
      />
    );
  }

  const allState = listCheckState(items, selected);
  const windowEnd = Math.min(rowCount, scroll + listHeight);

  return (
    <Box flexDirection="column">
      <Box>
        {done ? (
          <Text bold color="green">
            {t("largest.done", { count: items.length })}
          </Text>
        ) : (
          <Text color="cyan">
            <Spinner type="dots" /> {t("largest.scanning")}
          </Text>
        )}
        <Text dimColor>
          {"  "}
          {formatBytes(items.reduce((s, i) => s + i.sizeBytes, 0))}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginTop={1}
      >
        {Array.from({ length: windowEnd - scroll }, (_, offset) => {
          const i = scroll + offset;
          const active = i === cursor;
          const caret = active ? "❯ " : "  ";
          if (i === 0) {
            return (
              <Text
                key="select-all"
                inverse={active}
                color={active ? "black" : allState !== "none" ? "yellow" : "white"}
              >
                {caret}{checkGlyph(allState)}  {t("largest.selectAll")}  {t("scan.items", { count: items.length })}
              </Text>
            );
          }
          const item = items[i - 1];
          if (!item) return null;
          const on = selected.has(item.id);
          const glyph = on ? "[x]" : "[ ]";
          const bar = sizeBar(item.sizeBytes, maxBytes, BAR_WIDTH);
          const displayPath = truncatePath(item.path.replace(root, "") || item.path, pathWidth);
          return (
            <Box key={item.id}>
              <Text inverse={active} color={active ? "black" : on ? "yellow" : undefined}>
                {caret}{glyph}{" "}
              </Text>
              <Text color={active ? "cyan" : "blue"}>{bar}</Text>
              <Text color="green"> {formatBytes(item.sizeBytes).padStart(8)} </Text>
              <Text dimColor>{isoDate(item.lastModified)}  </Text>
              <Text inverse={active} color={active ? "black" : undefined}>
                {displayPath}
              </Text>
            </Box>
          );
        })}
        {rowCount > listHeight ? (
          <Text dimColor>
            {scroll + 1}–{windowEnd} / {rowCount}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">
          {t("scan.selected", { size: formatBytes(totals.bytes), count: totals.count })}
        </Text>
      </Box>
      <Text dimColor>{t("largest.hint")}</Text>
    </Box>
  );
}
