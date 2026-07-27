import type { AgentKind, AgentStatus, Project } from "$lib/types";

/** 사람이 개입해야 하는 상태인지 판정한다. */
export function needsAttention(status: AgentStatus | undefined): status is "failed" | "blocked" | "done" {
  return status === "failed" || status === "blocked" || status === "done";
}

/** 전역 인박스에 표시되는 한 건. 프로젝트 경계를 넘어 집계된다. */
export interface AttentionItem {
  agentId: string;
  agentTitle: string;
  projectId: string;
  projectName: string;
  kind: AgentKind;
  branch: string;
  status: "failed" | "blocked" | "done";
  updatedAt: number;
}

/** 실패를 최우선으로, 입력 대기와 완료를 차례로 정렬한다. */
const STATUS_ORDER: Record<AttentionItem["status"], number> = { failed: 0, blocked: 1, done: 2 };

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
  failed: number;
  done: number;
}

export function attentionCounts(items: AttentionItem[]): AttentionCounts {
  let failed = 0;
  let blocked = 0;
  for (const item of items) {
    if (item.status === "failed") failed++;
    if (item.status === "blocked") blocked++;
  }
  return { total: items.length, failed, blocked, done: items.length - failed - blocked };
}
