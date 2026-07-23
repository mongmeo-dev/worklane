import type { AgentStatus } from "$lib/types";

export function agentRowClasses(status: AgentStatus, selected: boolean): string {
  const base = "relative flex w-full flex-col rounded-[9px] px-2.5 py-2 text-left transition-colors ring-inset";
  if (status === "blocked") {
    return `${base} bg-status-blocked/7 ring-1 ${selected ? "ring-status-blocked/55" : "ring-status-blocked/35"}`;
  }
  return `${base} ${selected ? "bg-accent ring-1 ring-sidebar-ring" : "hover:bg-sidebar-accent/70"}`;
}

export function projectPathLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || path;
}
