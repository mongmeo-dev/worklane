import { t } from "$lib/i18n";
import type { ContextMenuModel } from "$lib/context-menu/model";

export type FileTabContextActionOptions = {
  worktreePath: string;
  path: string;
  onClose: () => void;
  copyPath?: (path: string) => Promise<void> | void;
};

function copyPath(path: string): Promise<void> {
  return navigator.clipboard.writeText(path);
}

/** Joins a worktree-relative path only for display and clipboard use. */
export function absoluteFilePath(worktreePath: string, path: string): string {
  const separator = worktreePath.includes("\\") ? "\\" : "/";
  const base = worktreePath.replace(/[\\/]+$/, "") || separator;
  const relativePath = path.replace(/^[\\/]+/, "").replace(/[\\/]+/g, separator);

  return base === separator ? `${base}${relativePath}` : `${base}${separator}${relativePath}`;
}

export function createFileTabContextActions({
  worktreePath,
  path,
  onClose,
  copyPath: writeClipboard = copyPath,
}: FileTabContextActionOptions): ContextMenuModel {
  const absolutePath = absoluteFilePath(worktreePath, path);

  return {
    ariaLabel: t("contextMenu.file"),
    items: [
      {
        type: "action",
        id: "copy-path",
        label: t("contextMenu.copyPath"),
        onSelect: () => {
          void writeClipboard(absolutePath);
        },
      },
      {
        type: "action",
        id: "close-file",
        label: t("agentDetail.closeFileTab"),
        onSelect: onClose,
      },
    ],
  };
}
