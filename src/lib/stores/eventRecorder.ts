import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";
import { logEvent } from "$lib/ipc/events";
import { statusLabels } from "$lib/data/labels";

/**
 * 상태 전이(입력 대기/완료) 밀리스톤을 감사 타임라인에 기록한다.
 * session_id는 agent_id와 동일하므로 그대로 사용한다.
 */
class EventRecorder {
  private prev = new Map<string, AgentStatus>();
  private started: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.started) return this.started;
    this.started = listenStatus((e) => {
      const before = this.prev.get(e.sessionId);
      this.prev.set(e.sessionId, e.status);
      if (before === undefined || before === e.status) return;
      if (e.status === "done" || e.status === "blocked") {
        logEvent(e.sessionId, "status", statusLabels[e.status]);
      }
    }).then(() => {});
    return this.started;
  }
}

export const eventRecorder = new EventRecorder();
