import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentStatus } from "$lib/types";

export type StatusChanged = { sessionId: string; status: AgentStatus };

/** status-changed 이벤트를 구독한다. */
export function listenStatus(cb: (e: StatusChanged) => void): Promise<UnlistenFn> {
  return listen<StatusChanged>("status-changed", (event) => cb(event.payload));
}
