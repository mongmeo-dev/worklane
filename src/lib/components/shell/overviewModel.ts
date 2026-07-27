import type { Agent, AgentStatus } from "$lib/types";
import type { OverviewFilter } from "$lib/stores/shell.svelte";
import { t } from "$lib/i18n";

export function filterAgents(agents: Agent[], filter: OverviewFilter): Agent[] {
  return filter === "all" ? agents : agents.filter((agent) => (agent.status ?? "idle") === filter);
}

export type OverviewSort = "activity" | "name" | "status";

/** 정렬 시 주의 필요 상태를 앞세우는 순서. */
const STATUS_ORDER: Record<AgentStatus, number> = { failed: 0, blocked: 1, running: 2, done: 3, idle: 4 };

/** 제목/브랜치/프로젝트명으로 검색한다. projectNameOf는 agent→프로젝트명 조회. */
export function searchAgents(
  agents: Agent[],
  query: string,
  projectNameOf: (agent: Agent) => string,
): Agent[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((agent) =>
    `${agent.title} ${agent.branch} ${projectNameOf(agent)}`.toLowerCase().includes(q),
  );
}

/** activity(최근 갱신순), name(제목순), status(주의 우선)로 정렬한다. */
export function sortAgents(agents: Agent[], sort: OverviewSort): Agent[] {
  const copy = [...agents];
  if (sort === "name") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "status") {
    copy.sort(
      (a, b) =>
        STATUS_ORDER[a.status ?? "idle"] - STATUS_ORDER[b.status ?? "idle"] ||
        b.updatedAt - a.updatedAt,
    );
  } else {
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return copy;
}

export function tileAction(status: AgentStatus): string {
  return t(`overview.action.${status}`);
}