import type { AgentStatus, Project } from "$lib/types";

export function agentRowClasses(status: AgentStatus, selected: boolean): string {
  const base =
    "relative flex w-full flex-col rounded-[9px] px-2.5 py-2 text-left transition-colors ring-inset";
  if (status === "failed") {
    return `${base} bg-destructive/7 ring-1 ${selected ? "ring-destructive/55" : "ring-destructive/35"}`;
  }
  if (status === "blocked") {
    return `${base} bg-status-blocked/7 ring-1 ${selected ? "ring-status-blocked/55" : "ring-status-blocked/35"}`;
  }
  return `${base} ${selected ? "bg-accent ring-1 ring-sidebar-ring" : "hover:bg-sidebar-accent/70"}`;
}

export function projectPathLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

/**
 * 사이드바 거르기. 프로젝트명이 걸리면 프로젝트 전체를 남기고, 아니면 제목·브랜치가
 * 걸리는 에이전트만 남긴다. 남은 에이전트가 없는 프로젝트는 제외한다.
 */
export function filterProjects(projects: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  const result: Project[] = [];
  for (const project of projects) {
    if (project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)) {
      result.push(project);
      continue;
    }
    const agents = project.agents.filter((agent) =>
      `${agent.title} ${agent.branch}`.toLowerCase().includes(q),
    );
    if (agents.length > 0) result.push({ ...project, agents });
  }
  return result;
}
