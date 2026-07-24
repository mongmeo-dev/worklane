import type { Agent, AgentStatus } from "$lib/types";
import type { OverviewFilter } from "$lib/stores/shell.svelte";

export function filterAgents(agents: Agent[], filter: OverviewFilter): Agent[] {
  return filter === "all" ? agents : agents.filter((agent) => (agent.status ?? "idle") === filter);
}

export type OverviewSort = "activity" | "name" | "status";

/** 정렬 시 주의 필요 상태를 앞세우는 순서. */
const STATUS_ORDER: Record<AgentStatus, number> = { blocked: 0, running: 1, done: 2, idle: 3 };

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
  return {
    running: "열기 →",
    blocked: "응답하기 →",
    idle: "재개 →",
    done: "변경 검토 →",
  }[status];
}

export function plainTerminalTail(value: string, lines = 7): string {
  const plain = value
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "")
    .trimEnd();
  return plain.split("\n").slice(-lines).join("\n");
}
