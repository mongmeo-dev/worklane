import { invoke } from "@tauri-apps/api/core";

export interface GithubIssue {
  number: number;
  title: string;
  url: string;
  body: string;
}

/** 저장소의 열린 GitHub 이슈를 조회한다(gh CLI 필요). */
export function githubIssues(repoPath: string): Promise<GithubIssue[]> {
  return invoke<GithubIssue[]>("github_issues", { repoPath });
}
