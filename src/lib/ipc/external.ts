import { invoke } from "@tauri-apps/api/core";

export type ExternalApp = "vscode" | "cursor" | "zed" | "finder";

export type ExternalIntent = "openDirectory" | "revealEntry";
export type ExternalPathPreflight =
  | { disposition: "exact" }
  | { disposition: "nearestParent"; nearestParent: string };

export function preflightExternalPath(
  worktreePath: string,
  relativePath: string,
): Promise<ExternalPathPreflight> {
  return invoke("preflight_external_path", { worktreePath, relativePath });
}

export function openDirectory(worktreePath: string, relativePath?: string): Promise<void> {
  return openInApp(worktreePath, "finder", "openDirectory", relativePath);
}

export function revealEntry(worktreePath: string, relativePath?: string): Promise<void> {
  return openInApp(worktreePath, "finder", "revealEntry", relativePath);
}

/** Opens a registered root in an editor or performs a typed file-manager operation. */
export function openInApp(
  worktreePath: string,
  app: ExternalApp,
  intent: ExternalIntent = "openDirectory",
  relativePath?: string,
): Promise<void> {
  return invoke("open_in_app", { worktreePath, app, intent, relativePath });
}
