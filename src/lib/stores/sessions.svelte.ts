import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";

/** 세션(=에이전트) ID → 실시간 상태 맵. Svelte 5 룬 기반 반응형. */
class SessionStatusStore {
  private map = $state<Record<string, AgentStatus>>({});
  private rev = $state<Record<string, number>>({});
  private startPromise: Promise<void> | null = null;
  // 삭제된 세션은 뒤늦은 status/output 이벤트가 도착해도 되살리지 않는다.
  private forgotten = new Set<string>();

  get(id: string): AgentStatus | undefined {
    return this.map[id];
  }

  set(id: string, status: AgentStatus): void {
    this.forgotten.delete(id);
    this.map[id] = status;
  }

  /** 세션이 삭제되면 런타임 상태와 출력 리비전을 함께 제거한다. */
  forget(id: string): void {
    this.forgotten.add(id);
    delete this.map[id];
    delete this.rev[id];
  }

  private setFromEvent(id: string, status: AgentStatus): void {
    if (this.forgotten.has(id)) return;
    this.map[id] = status;
  }

  /** 출력 미리보기 갱신 신호. 오버뷰 타일이 구독해 재계산 트리거로 쓴다. */
  revision(id: string): number {
    return this.rev[id] ?? 0;
  }

  /** 출력 청크마다 호출: 미리보기 구독자를 깨우는 리비전만 올린다(버퍼는 xterm이 소유). */
  noteOutput(id: string): void {
    if (this.forgotten.has(id)) return;
    this.rev[id] = (this.rev[id] ?? 0) + 1;
  }

  /** status-changed 이벤트 구독을 시작한다 (앱 마운트 시 1회, 멱등). */
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;

    const starting = listenStatus((e) => {
      this.setFromEvent(e.sessionId, e.status);
    }).then(() => {});
    this.startPromise = starting;
    void starting.catch(() => {
      if (this.startPromise === starting) this.startPromise = null;
    });
    return starting;
  }
}

export const sessionStatus = new SessionStatusStore();
