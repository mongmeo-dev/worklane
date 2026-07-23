import type { Agent, AgentStatus } from "$lib/types";
import type { OverviewFilter } from "$lib/stores/shell.svelte";

export function filterAgents(agents: Agent[], filter: OverviewFilter): Agent[] {
  return filter === "all" ? agents : agents.filter((agent) => (agent.status ?? "idle") === filter);
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
