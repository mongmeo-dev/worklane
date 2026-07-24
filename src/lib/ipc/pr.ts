import { invoke } from "@tauri-apps/api/core";

export interface PrCheck {
  name: string;
  status: string;
  conclusion: string;
}

export interface PrStatus {
  number: number;
  title: string;
  url: string;
  state: string;
  mergeable: string;
  reviewDecision: string;
  checks: PrCheck[];
}

export type PrMergeMethod = "squash" | "merge" | "rebase";

/** 현재 브랜치 PR의 상태를 조회한다. PR이 없으면 null. */
export function prStatus(worktreePath: string): Promise<PrStatus | null> {
  return invoke<PrStatus | null>("git_pr_status", { worktreePath });
}

/** 현재 브랜치의 PR을 병합한다. */
export function prMerge(worktreePath: string, method: PrMergeMethod): Promise<string> {
  return invoke<string>("git_pr_merge", { worktreePath, method });
}
