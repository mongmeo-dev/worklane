import type { AgentStatus } from "$lib/types";

/** 상태 pill 클래스. blocked만 솔리드 강조, 나머지는 틴트. */
export function badgeClasses(status: AgentStatus): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold";
  if (status === "blocked") {
    return `${base} bg-status-blocked text-status-blocked-on font-bold`;
  }
  const tint: Record<Exclude<AgentStatus, "blocked">, string> = {
    running: "text-status-running-fg bg-status-running/10",
    idle: "text-status-idle bg-status-idle/10",
    done: "text-status-done-fg bg-status-done/10",
    failed: "text-destructive bg-destructive/10",
  };
  return `${base} ${tint[status]}`;
}
