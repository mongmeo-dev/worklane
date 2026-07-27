/** 에이전트의 실행 상태. 3계층 하이브리드 트래킹으로 판별되는 값이다. */
export type AgentStatus = "running" | "idle" | "blocked" | "done" | "failed";

/** 에이전트 종류 식별자. 기본 제공 종류(claude-code·codex 등) 외에 사용자가 자유롭게
 * 추가할 수 있으므로 자유 문자열이다. "terminal"은 특정 에이전트 없이 기본 셸만 여는 빈 터미널.
 * 워크스페이스가 아니라 개별 터미널 탭에 주입하는 커맨드 프리셋을 가리킨다. */
export type AgentKind = string;

/** 워크스페이스(=worktree) 안에서 크롬 탭처럼 여는 터미널 세션 한 건.
 * id가 곧 PTY 세션 ID다. kind는 이 탭을 열 때 고른 프리셋이며, 실제로 어떤
 * 에이전트가 도는지는 런타임 프로세스 트리 감지(agentDetection)로 별도 추적한다. */
export interface AgentTerminal {
  id: string;
  agentId: string;
  /** 사용자가 붙인 탭 이름(비면 종류/감지 결과로 라벨링). */
  title: string;
  kind: AgentKind;
  /** 탭을 열 때 주입한 실행 커맨드(빈 터미널이면 ""). */
  command: string;
  /** 탭 정렬 순서. */
  position: number;
  createdAt: number;
}

export interface Agent {
  id: string;
  projectId: string;
  /** 사용자가 붙인 작업 이름 (예: "로그인 리팩터링") */
  title: string;
  /** 생성 시 첫 터미널을 시드한 대표 종류(사이드바·오버뷰 요약 표기용). */
  kind: AgentKind;
  /** 생성 시 첫 터미널에 주입한 대표 커맨드. */
  command: string;
  /** 격리된 git worktree의 브랜치명 */
  branch: string;
  /** 격리된 git worktree의 로컬 경로. diff 계산의 기준이 된다. */
  worktreePath: string;
  /** 앱이 자동 생성한 worktree면 true (삭제 시 정리 대상) */
  worktreeManaged: boolean;
  /** 팬아웃 그룹 식별자. 같은 프롬프트로 병렬 생성된 에이전트끼리 공유한다. */
  groupId?: string | null;
  /** 팬아웃 시 공유한 작업 프롬프트(비교/복사용). */
  prompt?: string | null;
  createdAt: number;
  updatedAt: number;
  /** 런타임 파생: 3계층 트래킹이 판별하는 실행 상태. 미실행 시 idle. */
  status?: AgentStatus;
  /** 런타임 파생: 마지막 활동 상대 시간 표기 */
  lastActivity?: string;
  /** 이 워크스페이스가 여는 터미널 탭 목록. 백엔드가 항상 채워 보낸다. */
  terminals?: AgentTerminal[];
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
