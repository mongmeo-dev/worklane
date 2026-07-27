import type { AgentStatus } from "$lib/types";

/** 상태별 점 색/애니메이션 클래스. running=pulse, blocked=ring pulse. */
export function dotClasses(status: AgentStatus): string {
  const bg: Record<AgentStatus, string> = {
    running: "bg-status-running",
    idle: "bg-status-idle",
    blocked: "bg-status-blocked",
    done: "bg-status-done",
    failed: "bg-destructive",
  };
  const anim: Record<AgentStatus, string> = {
    running: "status-dot-anim animate-[status-dot-pulse_1.6s_ease-in-out_infinite]",
    idle: "",
    blocked: "status-ring-anim animate-[status-ring-pulse_1.8s_ease-out_infinite]",
    done: "",
    failed: "",
  };
  return `${bg[status]} ${anim[status]}`.trim();
}
