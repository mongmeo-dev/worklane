import { invoke } from "@tauri-apps/api/core";

export interface LinearIssue {
  identifier: string;
  title: string;
  url: string;
  description: string;
}

/** Linear에서 내게 할당된 미완료 이슈를 조회한다(API 키 필요). */
export function linearIssues(apiKey: string): Promise<LinearIssue[]> {
  return invoke<LinearIssue[]>("linear_issues", { apiKey });
}
