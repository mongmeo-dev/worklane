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

/** 프로젝트 저장소 본체(메인 워킹트리)에서 동작하는 기본 작업환경 에이전트가 있는지 확인한다. */
export function hasDefaultWorkspace(project: Project): boolean {
  return project.agents.some((agent) => agent.worktreePath === project.path);
}

export function statusCounts(projects: Project[]): StatusCounts {
  const counts: StatusCounts = { running: 0, blocked: 0, idle: 0, done: 0 };
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
