import type { Agent, AgentStatus, Project } from "$lib/types";

export type StatusCounts = Record<AgentStatus, number>;

export interface WorktreeGroup {
  key: string;
  branch: string;
  path: string;
  shared: boolean;
  agents: Agent[];
}

export function allAgents(projects: Project[]): Agent[] {
  return projects.flatMap((project) => project.agents);
}

/** 워크스페이스의 대표 세션 id. 첫 터미널을 쓰고, 없으면 워크스페이스 id로 폴백한다.
 * 오버뷰 미리보기·프리뷰 포트 감지처럼 "워크스페이스 하나"를 대표해야 하는 곳에서 쓴다. */
export function representativeTerminalId(agent: Agent): string {
  return agent.terminals?.[0]?.id ?? agent.id;
}

/** 여러 터미널 상태를 워크스페이스 단위 하나로 합친다. 우선순위: failed > blocked > running > idle > done. */
export function aggregateStatus(statuses: (AgentStatus | undefined)[]): AgentStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("idle")) return "idle";
  if (statuses.includes("done")) return "done";
  return "idle";
}

/** 프로젝트 저장소 본체(메인 워킹트리)에서 동작하는 기본 작업환경 에이전트가 있는지 확인한다. */
export function hasDefaultWorkspace(project: Project): boolean {
  return project.agents.some((agent) => agent.worktreePath === project.path);
}

export function statusCounts(projects: Project[]): StatusCounts {
  const counts: StatusCounts = { running: 0, blocked: 0, idle: 0, done: 0, failed: 0 };
  for (const agent of allAgents(projects)) counts[agent.status ?? "idle"] += 1;
  return counts;
}

export function worktreeGroups(project: Project): WorktreeGroup[] {
  const groups = new Map<string, Agent[]>();
  for (const agent of project.agents) {
    const key = `${project.id}:${agent.worktreePath}`;
    groups.set(key, [...(groups.get(key) ?? []), agent]);
  }
  return [...groups.entries()].map(([key, agents]) => ({
    key,
    branch: agents[0]?.branch ?? "",
    path: agents[0]?.worktreePath ?? "",
    shared: agents.length > 1,
    agents,
  }));
}

export function agentsForWorktree(projects: Project[], agent: Agent): Agent[] {
  return allAgents(projects).filter(
    (candidate) => candidate.projectId === agent.projectId && candidate.worktreePath === agent.worktreePath,
  );
}
