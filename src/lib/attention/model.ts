import type { AgentKind, AgentStatus, Project } from "$lib/types";

/** 사람이 개입해야 하는 상태(입력 대기 또는 완료)인지 판정한다. */
export function needsAttention(status: AgentStatus | undefined): status is "blocked" | "done" {
  return status === "blocked" || status === "done";
}

/** 전역 인박스에 표시되는 한 건. 프로젝트 경계를 넘어 집계된다. */
export interface AttentionItem {
  agentId: string;
  agentTitle: string;
  projectId: string;
  projectName: string;
  kind: AgentKind;
  branch: string;
  status: "blocked" | "done";
  updatedAt: number;
}

/** 입력 대기(blocked)를 완료(done)보다 앞에 정렬한다. */
const STATUS_ORDER: Record<AttentionItem["status"], number> = { blocked: 0, done: 1 };

/**
 * 모든 프로젝트의 에이전트 중 주의가 필요한 것만 모아 정렬한다.
 * 정렬: 입력 대기 우선 → 같은 상태면 최근 갱신 순.
 */
export function attentionItems(projects: Project[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const project of projects) {
    for (const agent of project.agents) {
      const status = agent.status ?? "idle";
      if (!needsAttention(status)) continue;
      items.push({
        agentId: agent.id,
        agentTitle: agent.title,
        projectId: project.id,
        projectName: project.name,
        kind: agent.kind,
        branch: agent.branch,
        status,
        updatedAt: agent.updatedAt,
      });
    }
  }
  items.sort((a, b) =>
    a.status !== b.status ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status] : b.updatedAt - a.updatedAt,
  );
  return items;
}

export interface AttentionCounts {
  total: number;
  blocked: number;
  done: number;
}

export function attentionCounts(items: AttentionItem[]): AttentionCounts {
  let blocked = 0;
  for (const item of items) if (item.status === "blocked") blocked++;
  return { total: items.length, blocked, done: items.length - blocked };
}
