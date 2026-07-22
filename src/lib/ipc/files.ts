import { invoke } from "@tauri-apps/api/core";

export type FileChange = "none" | "modified" | "new" | "deleted";

export interface FileEntry {
  path: string;
  dir: string;
  name: string;
  change: FileChange;
  add: number;
  del: number;
}

export interface FileContent {
  content: string;
  isBinary: boolean;
}

export type DiffLineKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export function listWorktreeFiles(worktreePath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_worktree_files", { worktreePath });
}

export function readWorktreeFile(
  worktreePath: string,
  relPath: string,
): Promise<FileContent> {
  return invoke<FileContent>("read_worktree_file", { worktreePath, relPath });
}

export function gitFileDiff(
  worktreePath: string,
  relPath: string,
): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("git_file_diff", { worktreePath, relPath });
}
