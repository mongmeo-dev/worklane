import type { ContextMenuModel } from "$lib/context-menu/model";
import { t } from "$lib/i18n";
import {
  openDirectory,
  revealEntry,
  type ExternalPathPreflight,
} from "$lib/ipc/external";

function copyPath(path: string): Promise<void> {
  return navigator.clipboard.writeText(path);
}
function externalActionLabel(
  exactKey: "contextMenu.openFileManager" | "contextMenu.revealInFileManager",
  target?: ExternalPathPreflight,
): string {
  return target?.disposition === "nearestParent"
    ? t("contextMenu.openNearestParent", { path: target.nearestParent })
    : t(exactKey);
}

export function folderContextActions({
  worktreePath,
  path,
  expanded,
  onToggle,
  externalTarget,
}: {
  worktreePath: string;
  path: string;
  expanded: boolean;
  onToggle: () => void;
  externalTarget?: ExternalPathPreflight;
}): ContextMenuModel {
  return {
    ariaLabel: t("contextMenu.folder"),
    items: [
      {
        type: "action",
        id: "toggle",
        label: t(expanded ? "contextMenu.collapse" : "contextMenu.expand"),
        onSelect: onToggle,
      },
      {
        type: "action",
        id: "reveal",
        label: externalActionLabel("contextMenu.openFileManager", externalTarget),
        onSelect: () => openDirectory(worktreePath, path),
      },
      { type: "separator" },
      { type: "action", id: "copy-path", label: t("contextMenu.copyPath"), onSelect: () => copyPath(path) },
    ],
  };
}

export function fileContextActions({
  worktreePath,
  path,
  onOpen,
  externalTarget,
}: {
  worktreePath: string;
  path: string;
  onOpen: () => void;
  externalTarget?: ExternalPathPreflight;
}): ContextMenuModel {
  return {
    ariaLabel: t("contextMenu.file"),
    items: [
      { type: "action", id: "open", label: t("common.open"), onSelect: onOpen },
      {
        type: "action",
        id: "reveal",
        label: externalActionLabel("contextMenu.revealInFileManager", externalTarget),
        onSelect: () => revealEntry(worktreePath, path),
      },
      { type: "separator" },
      { type: "action", id: "copy-path", label: t("contextMenu.copyPath"), onSelect: () => copyPath(path) },
    ],
  };
}
