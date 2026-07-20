import { invoke } from "@tauri-apps/api/core";

/**
 * 지정한 worktree 경로의 uncommitted 변경(working tree diff)을 unified diff 문자열로 가져온다.
 * `git diff HEAD` + untracked 파일을 합친 결과에 대응한다.
 */
export function gitDiff(cwd: string): Promise<string> {
  return invoke<string>("git_diff", { cwd });
}
