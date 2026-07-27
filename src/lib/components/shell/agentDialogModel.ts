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
}

/**
 * 워크스페이스 추가 폼이 제출 가능한지 판정한다.
 * - 워크스페이스는 항상 새 worktree를 만든다(여러 에이전트 공유 개념 없음).
 * - 작업 이름은 선택값이다(비우면 브랜치 이름을 기본값으로 사용).
 * - 브랜치와 분기 기준은 필수다.
 * - 첫 터미널이 빈 터미널이 아니면 실행 커맨드가 필요하다.
 */
export function canCreateWorkspace(input: WorkspaceFormInput): boolean {
  if (!input.branch.trim() || !input.startPoint.trim()) return false;
  if (requiresCommand(input.kind) && !input.command.trim()) return false;
  return true;
}

/** 실행 커맨드의 첫 토큰을 프리플라이트 대상 실행 파일로 추출한다. */
export function commandExecutable(command: string): string | null {
  const match = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

/**
 * 작업 이름을 확정한다. 비어 있으면 브랜치 이름을 기본값으로 사용한다.
 * branch는 새 worktree의 브랜치이거나 공유하는 기존 에이전트의 브랜치다(호출부에서 확정).
 */
export function resolveWorkspaceTitle(title: string, branch: string): string {
  return title.trim() || branch.trim();
}
