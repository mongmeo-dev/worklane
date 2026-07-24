import { invoke } from "@tauri-apps/api/core";

export interface MergePreview {
  base: string;
  branch: string;
  /** 충돌 파일 목록(비면 깨끗) */
  conflicts: string[];
  /** 이미 기준 브랜치에 병합돼 있는가 */
  alreadyMerged: boolean;
  /** 기준 브랜치가 어떤 worktree에 체크아웃돼 있는가 */
  baseCheckedOut: boolean;
}

export function gitMergePreview(worktreePath: string): Promise<MergePreview> {
  return invoke<MergePreview>("git_merge_preview", { worktreePath });
}

/** 현재 브랜치를 기준 브랜치에 로컬 병합한다. 성공 메시지를 반환한다. */
export function gitMergeIntoBase(worktreePath: string): Promise<string> {
  return invoke<string>("git_merge_into_base", { worktreePath });
}
