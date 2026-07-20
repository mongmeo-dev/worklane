/** 에이전트의 실행 상태. 3계층 하이브리드 트래킹으로 판별되는 값이다. */
export type AgentStatus = "running" | "idle" | "blocked" | "done";

/** 지원하는 CLI 코딩 에이전트 종류. */
export type AgentKind = "claude-code" | "codex" | "cursor" | "gemini";

export interface Agent {
  id: string;
  /** 사용자가 붙인 작업 이름 (예: "로그인 리팩터링") */
  title: string;
  kind: AgentKind;
  status: AgentStatus;
  /** 격리된 git worktree의 브랜치명 */
  branch: string;
  /** 마지막 활동으로부터 경과한 상대 시간 표기 */
  lastActivity: string;
}

export interface Project {
  id: string;
  name: string;
  /** 로컬 저장소 경로 */
  path: string;
  agents: Agent[];
}
