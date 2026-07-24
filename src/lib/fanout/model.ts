import type { Agent, AgentKind, Project } from "$lib/types";

/** 브랜치/worktree 이름에 쓸 slug를 만든다. 영숫자·한글만 남기고 나머지는 하이픈으로. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^0-9a-z가-힣-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 팬아웃 멤버의 브랜치명. slug가 비면 groupId 앞자리로 대체한다. */
export function fanoutBranch(title: string, kind: AgentKind, groupId: string): string {
  const base = slugify(title) || groupId.slice(0, 8);
  return `fanout/${base}-${kind}`;
}

export interface FanoutGroup {
  groupId: string;
  projectId: string;
  projectName: string;
  title: string;
  prompt: string;
  members: Agent[];
}

/** 프로젝트들에서 groupId가 같은 에이전트를 묶어 팬아웃 그룹 목록을 만든다. */
export function fanoutGroups(projects: Project[]): FanoutGroup[] {
  const groups = new Map<string, FanoutGroup>();
  for (const project of projects) {
    for (const agent of project.agents) {
      if (!agent.groupId) continue;
      let group = groups.get(agent.groupId);
      if (!group) {
        group = {
          groupId: agent.groupId,
          projectId: project.id,
          projectName: project.name,
          title: agent.title,
          prompt: agent.prompt ?? "",
          members: [],
        };
        groups.set(agent.groupId, group);
      }
      group.members.push(agent);
    }
  }
  return [...groups.values()];
}

/** groupId로 팬아웃 그룹을 찾는다. */
export function groupOf(projects: Project[], groupId: string): FanoutGroup | undefined {
  return fanoutGroups(projects).find((g) => g.groupId === groupId);
}
