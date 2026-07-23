import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";

/** 세션(=에이전트) ID → 실시간 상태 맵. Svelte 5 룬 기반 반응형. */
class SessionStatusStore {
  private map = $state<Record<string, AgentStatus>>({});
  private output = $state<Record<string, string>>({});
  private startPromise: Promise<void> | null = null;
  private decoder = new TextDecoder();

  get(id: string): AgentStatus | undefined {
    return this.map[id];
  }

  set(id: string, status: AgentStatus): void {
    this.map[id] = status;
  }

  tail(id: string): string {
    return this.output[id] ?? "";
  }

  appendOutput(id: string, bytes: Uint8Array): void {
    const next = `${this.output[id] ?? ""}${this.decoder.decode(bytes, { stream: true })}`;
    this.output[id] = next.slice(-6000);
  }

  /** status-changed 이벤트 구독을 시작한다 (앱 마운트 시 1회, 멱등). */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = listenStatus((e) => {
      this.map[e.sessionId] = e.status;
    }).then(() => {});
    return this.startPromise;
  }
}

export const sessionStatus = new SessionStatusStore();
