import type { ContextMenuModel } from "$lib/context-menu/model";
import { t } from "$lib/i18n";
import { openDirectory, revealEntry } from "$lib/ipc/external";

function copyPath(path: string): Promise<void> {
  return navigator.clipboard.writeText(path);
}

export function folderContextActions({
  worktreePath,
  path,
  expanded,
  onToggle,
}: {
  worktreePath: string;
  path: string;
  expanded: boolean;
  onToggle: () => void;
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
        label: t("contextMenu.openFileManager"),
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
}: {
  worktreePath: string;
  path: string;
  onOpen: () => void;
}): ContextMenuModel {
  return {
    ariaLabel: t("contextMenu.file"),
    items: [
      { type: "action", id: "open", label: t("common.open"), onSelect: onOpen },
      {
        type: "action",
        id: "reveal",
        label: t("contextMenu.revealInFileManager"),
        onSelect: () => revealEntry(worktreePath, path),
      },
      { type: "separator" },
      { type: "action", id: "copy-path", label: t("contextMenu.copyPath"), onSelect: () => copyPath(path) },
    ],
  };
}
