/** 에이전트의 실행 상태. 3계층 하이브리드 트래킹으로 판별되는 값이다. */
export type AgentStatus = "running" | "idle" | "blocked" | "done";

/** 지원하는 CLI 코딩 에이전트 종류. */
export type AgentKind = "claude-code" | "codex" | "cursor" | "gemini";

export interface Agent {
  id: string;
  projectId: string;
  /** 사용자가 붙인 작업 이름 (예: "로그인 리팩터링") */
  title: string;
  kind: AgentKind;
  /** 실행 커맨드 (예: "claude", "codex --model o3") */
  command: string;
  /** 격리된 git worktree의 브랜치명 */
  branch: string;
  /** 격리된 git worktree의 로컬 경로. diff 계산의 기준이 된다. */
  worktreePath: string;
  /** 앱이 자동 생성한 worktree면 true (삭제 시 정리 대상) */
  worktreeManaged: boolean;
  createdAt: number;
  updatedAt: number;
  /** 런타임 파생: 3계층 트래킹이 판별하는 실행 상태. 미실행 시 idle. */
  status?: AgentStatus;
  /** 런타임 파생: 마지막 활동 상대 시간 표기 */
  lastActivity?: string;
}

export interface Project {
  id: string;
  name: string;
  /** 로컬 저장소 경로 */
  path: string;
  createdAt: number;
  updatedAt: number;
  agents: Agent[];
}
