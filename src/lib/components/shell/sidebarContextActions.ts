import type { ContextMenuModel } from "$lib/context-menu/model";
import { t } from "$lib/i18n";
import type { ExternalApp } from "$lib/ipc/external";
import { openInApp } from "$lib/ipc/external";
import type { Agent, Project } from "$lib/types";

const externalApps: readonly { app: ExternalApp; label: Parameters<typeof t>[0] }[] = [
  { app: "vscode", label: "contextMenu.openVSCode" },
  { app: "cursor", label: "contextMenu.openCursor" },
  { app: "zed", label: "contextMenu.openZed" },
  { app: "finder", label: "contextMenu.openFileManager" },
];

function externalAppItems(worktreePath: string) {
  return externalApps.map(({ app, label }) => ({
    type: "action" as const,
    id: `open-${app}`,
    label: t(label),
    onSelect: () => openInApp(worktreePath, app),
  }));
}

export function projectContextActions({
  project,
  onAddWorkspace,
  onDelete,
}: {
  project: Project;
  onAddWorkspace: () => void;
  onDelete: () => void;
}): ContextMenuModel {
  return {
    ariaLabel: t("contextMenu.project"),
    items: [
      { type: "action", id: "add-workspace", label: t("contextMenu.addWorkspace"), onSelect: onAddWorkspace },
      { type: "action", id: "open-file-manager", label: t("contextMenu.openFileManager"), onSelect: () => openInApp(project.path, "finder") },
      { type: "separator" },
      { type: "action", id: "delete-project", label: t("common.delete"), onSelect: onDelete },
    ],
  };
}

export function workspaceContextActions({
  agent,
  onSelect,
  onRename,
  onDelete,
}: {
  agent: Agent;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}): ContextMenuModel {
  return {
    ariaLabel: t("contextMenu.workspace"),
    items: [
      { type: "action", id: "select", label: t("common.select"), onSelect },
      { type: "action", id: "rename", label: t("contextMenu.renameWorkspace"), onSelect: onRename },
      {
        type: "submenu",
        id: "open-external",
        label: t("contextMenu.openInExternalApp"),
        items: externalAppItems(agent.worktreePath),
      },
      { type: "separator" },
      { type: "action", id: "delete-workspace", label: t("contextMenu.deleteWorkspace"), onSelect: onDelete },
    ],
  };
}
