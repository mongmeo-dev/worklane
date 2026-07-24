import type { AgentKind } from "$lib/types";
import { BLANK_TERMINAL_KIND } from "$lib/data/labels";

/** 빈 터미널 워크스페이스는 특정 CLI를 실행하지 않으므로 실행 커맨드가 필요 없다. */
export function requiresCommand(kind: AgentKind): boolean {
  return kind !== BLANK_TERMINAL_KIND;
}

export interface WorkspaceFormInput {
  title: string;
  kind: AgentKind;
  command: string;
  branch: string;
  startPoint: string;
  /** "new"이면 새 worktree, 그 외 값이면 공유할 기존 에이전트 id. */
  worktreeMode: string;
}

/**
 * 워크스페이스(에이전트) 추가 폼이 제출 가능한지 판정한다.
 * - 작업 이름은 선택값이다(비우면 브랜치 이름을 기본값으로 사용).
 * - 새 worktree일 때만 브랜치·분기 기준이 필요하다(공유 시에는 기존 값을 재사용).
 * - 빈 터미널을 제외한 종류는 실행 커맨드가 필요하다.
 */
export function canCreateWorkspace(input: WorkspaceFormInput): boolean {
  if (input.worktreeMode === "new" && (!input.branch.trim() || !input.startPoint.trim())) {
    return false;
  }
  if (requiresCommand(input.kind) && !input.command.trim()) return false;
  return true;
}

/**
 * 작업 이름을 확정한다. 비어 있으면 브랜치 이름을 기본값으로 사용한다.
 * branch는 새 worktree의 브랜치이거나 공유하는 기존 에이전트의 브랜치다(호출부에서 확정).
 */
export function resolveWorkspaceTitle(title: string, branch: string): string {
  return title.trim() || branch.trim();
}
