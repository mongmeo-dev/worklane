import { invoke } from "@tauri-apps/api/core";

export interface ReviewStatus {
  branch: string;
  /** working tree의 uncommitted 변경 파일 수 */
  changedCount: number;
  /** 추적 브랜치(@{u})가 설정돼 있는가 */
  hasUpstream: boolean;
  /** 추적 브랜치보다 앞선(푸시 안 된) 커밋 수 */
  ahead: number;
  /** 추적 브랜치보다 뒤진 커밋 수 */
  behind: number;
  /** origin 원격이 설정돼 있는가 */
  hasRemote: boolean;
}

export interface PullRequest {
  url: string;
  mode: "gh" | "compare";
}

export function gitReviewStatus(worktreePath: string): Promise<ReviewStatus> {
  return invoke<ReviewStatus>("git_review_status", { worktreePath });
}

export function gitCommitAll(worktreePath: string, message: string): Promise<void> {
  return invoke("git_commit_all", { worktreePath, message });
}

export function gitPush(worktreePath: string): Promise<string> {
  return invoke<string>("git_push", { worktreePath });
}

export function gitOpenPullRequest(worktreePath: string): Promise<PullRequest> {
  return invoke<PullRequest>("git_open_pull_request", { worktreePath });
}
