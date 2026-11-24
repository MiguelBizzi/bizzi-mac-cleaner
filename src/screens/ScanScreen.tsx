import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { useAppContext } from "../app.js";
import { deleteItems, type DeleteFailure } from "../core/deleteItems.js";
import { revealInFinder } from "../core/finder.js";
import { formatBytes } from "../core/format.js";
import { t } from "../core/i18n.js";
import { isReusableScan, type ScanCacheId } from "../core/scanCache.js";
import { buildScanRows, followScroll, moveCursor } from "../core/scanView.js";
import {
  categoryCheckState,
  checkGlyph,
  needsExtraConfirm,
  selectAllInCategory,
  selectedItems,
  selectedTotal,
  toggleAll,
  toggleId,
} from "../core/selection.js";
import { clearScreen } from "../core/terminal.js";
import { cacheScanners, runScanners, scannerById } from "../scanners/index.js";
import type { CleanupItem, Scanner } from "../scanners/types.js";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal.js";

const HEADER_CHROME = 8;

export function ScanScreen({
  scanners = cacheScanners,
  cacheId = "scan",
}: {
  scanners?: Scanner[];
  cacheId?: ScanCacheId;
}): React.ReactElement {
  const { root, config, navigate, getScanCache, setScanCache } = useAppContext();
  const { stdout } = useStdout();
  const params = { root, staleDays: config.staleDays };
  const cached = getScanCache(cacheId);
  const restore = isReusableScan(cached, params);
  const skipInitialScan = useRef(restore);
  const [scanNonce, setScanNonce] = useState(0);
  const [items, setItems] = useState<CleanupItem[]>(() => (restore && cached ? cached.items : []));
  const [done, setDone] = useState(restore);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [phase, setPhase] = useState<"list" | "confirm" | "deleting" | "done">("list");
  const [pending, setPending] = useState<CleanupItem[]>([]);
  const [queue, setQueue] = useState<CleanupItem[] | null>(null);
  const [failures, setFailures] = useState<DeleteFailure[]>([]);

  useEffect(() => {
    if (scanNonce === 0 && skipInitialScan.current) return;
    const ac = new AbortController();
    setItems([]);
    setDone(false);
    setSelected(new Set());
    setExpanded(new Set());
    setCursor(0);
    setScroll(0);
    void (async () => {
      const collected: CleanupItem[] = [];
      try {
        for await (const item of runScanners(scanners, {
          root,
          staleDays: config.staleDays,
          signal: ac.signal,
        })) {
          collected.push(item);
          setItems((prev) => [...prev, item]);
        }
      } catch {
        // One unreadable directory must not reject this floating task and kill the process.
      } finally {
        if (!ac.signal.aborted) {
          setDone(true);
          setScanCache(cacheId, {
            items: collected,
            done: true,
            root,
            staleDays: config.staleDays,
          });
        }
      }
    })();
    return () => ac.abort();
  }, [root, config.staleDays, scanners, cacheId, scanNonce, setScanCache]);

  const rows = useMemo(() => buildScanRows(items, expanded), [items, expanded]);
  const listHeight = Math.max(6, (stdout.rows || 24) - HEADER_CHROME);
  const totals = selectedTotal(items, selected);
  const foundBytes = items.reduce((s, i) => s + i.sizeBytes, 0);

  useEffect(() => {
    setCursor((c) => moveCursor(c, 0, rows.length));
    setScroll((s) => followScroll(s, Math.min(cursor, Math.max(0, rows.length - 1)), rows.length, listHeight));
  }, [rows.length, listHeight, cursor]);

  const backToList = () => {
    clearScreen(stdout);
    setPhase("list");
    setQueue(null);
    setFailures([]);
  };

  useInput((input, key) => {
    if (phase !== "list") return;
    if (key.escape) {
      navigate("menu");
      return;
    }
    if (key.upArrow) {
      setCursor((c) => moveCursor(c, -1, rows.length));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => moveCursor(c, 1, rows.length));
      return;
    }
    if (input === "a") {
      setSelected((prev) => toggleAll(items, prev));
      return;
    }
    if (input === "r") {
      skipInitialScan.current = false;
      setScanNonce((n) => n + 1);
      return;
    }
    const row = rows[cursor];
    if (!row) return;
    if (key.leftArrow && row.type === "category") {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(row.group.id);
        return next;
      });
      return;
    }
    if (key.rightArrow && row.type === "category") {
      setExpanded((prev) => new Set(prev).add(row.group.id));
      return;
    }
    if (input === " ") {
      if (row.type === "item") {
        setSelected((prev) => toggleId(prev, row.item.id, items));
      } else {
        setSelected((prev) => selectAllInCategory(prev, items, row.group.id));
      }
      return;
    }
    if (input === "o") {
      const target = row.type === "item" ? row.item.path : row.group.items[0]?.path;
      if (target) void revealInFinder(target);
      return;
    }
    if (key.return) {
      const chosen = selectedItems(items, selected);
      if (chosen.length === 0) return;
      if (config.confirmEveryDelete) {
        setQueue(chosen.slice(1));
        setPending([chosen[0]!]);
      } else {
        setQueue(null);
        setPending(chosen);
      }
      clearScreen(stdout);
      setPhase("confirm");
    }
  });

  const confirm = async () => {
    setPhase("deleting");
    const result = await deleteItems(pending, root);
    const ids = new Set(result.succeeded.map((i) => i.id));
    const nextItems = items.filter((i) => !ids.has(i.id));
    setItems(nextItems);
    if (done) {
      setScanCache(cacheId, {
        items: nextItems,
        done: true,
        root,
        staleDays: config.staleDays,
      });
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    if (queue && queue.length > 0 && result.failed.length === 0) {
      setPending([queue[0]!]);
      setQueue(queue.slice(1));
      setPhase("confirm");
      return;
    }
    setPending(result.succeeded);
    setFailures(result.failed);
    clearScreen(stdout);
    setPhase("done");
  };

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

  const visible = rows.slice(scroll, scroll + listHeight);

  return (
    <Box flexDirection="column">
      <Box>
        {done ? (
          <Text color="green">{t("scan.done")}</Text>
        ) : (
          <Text color="cyan">
            <Spinner type="dots" /> {t("scan.scanning")}
          </Text>
        )}
        <Text>  {t("scan.total", { size: formatBytes(foundBytes) })}  </Text>
        <Text dimColor>{t("scan.items", { count: items.length })}</Text>
      </Box>
      {items.length === 0 && done ? <Text dimColor>{t("scan.empty")}</Text> : null}
      {visible.map((row, offset) => {
        const i = scroll + offset;
        const active = i === cursor;
        const caret = active ? "❯ " : "  ";
        if (row.type === "category") {
          const open = expanded.has(row.group.id);
          const label = t(scannerById(row.group.id)?.labelKey ?? row.group.id);
          const check = checkGlyph(categoryCheckState(items, selected, row.group.id));
          return (
            <Text key={row.group.id} inverse={active} color={active ? "black" : check !== "[ ]" ? "yellow" : undefined}>
              {caret}{check} {open ? "▼" : "▶"} {label}  {formatBytes(row.group.bytes)}  {t("scan.items", { count: row.group.items.length })}
            </Text>
          );
        }
        const mark = selected.has(row.item.id) ? "[x]" : "[ ]";
        const stale =
          row.item.stale === undefined ? "" : row.item.stale ? t("scan.stale") : t("scan.active");
        return (
          <Text
            key={row.item.id}
            inverse={active}
            color={active ? "black" : selected.has(row.item.id) ? "yellow" : undefined}
          >
            {caret}  {mark} {row.item.description ?? row.item.path}  {formatBytes(row.item.sizeBytes)}  {stale}{" "}
            {t(`scan.${row.item.risk}`)}
          </Text>
        );
      })}
      {rows.length > listHeight ? (
        <Text dimColor>
          {scroll + 1}–{Math.min(scroll + listHeight, rows.length)} / {rows.length}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text color="yellow">
          {t("scan.selected", { size: formatBytes(totals.bytes), count: totals.count })}
        </Text>
      </Box>
      <Text dimColor>{t("scan.hint")}</Text>
    </Box>
  );
}
