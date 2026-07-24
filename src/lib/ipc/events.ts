import { invoke } from "@tauri-apps/api/core";

export interface AgentEvent {
  id: string;
  agentId: string;
  kind: string;
  detail: string;
  createdAt: number;
}

export function recordEvent(agentId: string, kind: string, detail: string): Promise<AgentEvent> {
  return invoke<AgentEvent>("record_event", { agentId, kind, detail });
}

/** 실패해도 조용히 무시하는 fire-and-forget 기록. 액션 성공 흐름을 막지 않는다. */
export function logEvent(agentId: string, kind: string, detail: string): void {
  void recordEvent(agentId, kind, detail).catch(() => {});
}

export function listEvents(agentId: string): Promise<AgentEvent[]> {
  return invoke<AgentEvent[]>("list_events", { agentId });
}
