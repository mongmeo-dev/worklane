import { invoke } from "@tauri-apps/api/core";

export type ExternalApp = "vscode" | "cursor" | "zed" | "finder";

/** worktree 경로를 외부 에디터 또는 파일 매니저로 연다. */
export function openInApp(worktreePath: string, app: ExternalApp): Promise<void> {
  return invoke("open_in_app", { worktreePath, app });
}
