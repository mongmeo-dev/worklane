import { detectSessionProcesses } from "$lib/ipc/pty";
import { actionErrors } from "$lib/stores/actionErrors.svelte";
import { agentKindStore } from "$lib/stores/agentKinds.svelte";

const CLOSED_SESSION_ERRORS = new Set(["SESSION_CLOSED", "SESSION_NOT_FOUND"]);

function isClosedSessionError(reason: unknown): boolean {
  if (typeof reason === "string") return CLOSED_SESSION_ERRORS.has(reason);
  if (reason instanceof Error) return CLOSED_SESSION_ERRORS.has(reason.message);
  if (typeof reason !== "object" || reason === null) return false;
  return "code" in reason && typeof reason.code === "string" && CLOSED_SESSION_ERRORS.has(reason.code);
}

/**
 * 터미널 세션 안에서 실제로 도는 CLI 에이전트를 런타임에 감지해 캐싱한다.
 *
 * 프로세스 트리(자손 포함)를 훑어 얻은 토큰을 종류 프리셋과 매칭하므로,
 * tmux 등 멀티플렉서를 뚫고 빈 터미널에서 직접 `claude`를 띄운 경우도 잡아낸다.
 * 탭 라벨/아이콘이 "어떤 에이전트인지"를 이 값으로 표시한다.
 */
class AgentDetectionStore {
  // 세션 ID → 감지된 종류 id (없으면 null). Svelte 5 룬 기반 반응형.
  private map = $state<Record<string, string | null>>({});
  // 현재 마운트된 정확한 터미널 세션의 세대 토큰. 비활성화하면 항목 자체를 제거한다.
  private active = new Map<string, symbol>();

  /** 세션에서 감지된 종류 id. 아직 감지 전이거나 매칭 없으면 null. */
  get(sessionId: string): string | null {
    return this.map[sessionId] ?? null;
  }

  /** 터미널 뷰가 소유한 정확한 세션 ID를 감지 대상으로 등록한다. */
  activate(sessionId: string): void {
    if (!this.active.has(sessionId)) this.active.set(sessionId, Symbol(sessionId));
  }

  /** 터미널 뷰가 사라지면 감지 대상과 캐시를 함께 제거한다. */
  deactivate(sessionId: string): void {
    this.active.delete(sessionId);
    delete this.map[sessionId];
  }

  /** 한 세션의 프로세스 트리를 확인해 감지 결과를 갱신한다. */
  async refresh(sessionId: string): Promise<void> {
    const generation = this.active.get(sessionId);
    if (!generation) return;

    try {
      const tokens = await detectSessionProcesses(sessionId);
      if (this.active.get(sessionId) !== generation) return;
      this.map[sessionId] = agentKindStore.detectKind(tokens);
    } catch (reason) {
      if (this.active.get(sessionId) !== generation) return;
      if (isClosedSessionError(reason)) {
        this.forget(sessionId);
        return;
      }
      actionErrors.report(reason);
    }
  }

  /** 여러 세션을 한꺼번에 갱신한다. */
  async refreshAll(sessionIds: string[]): Promise<void> {
    await Promise.all(sessionIds.map((id) => this.refresh(id)));
  }

  /** 세션이 영구적으로 사라지면 모든 감지 상태를 제거한다. */
  forget(sessionId: string): void {
    this.deactivate(sessionId);
  }
}

export const agentDetection = new AgentDetectionStore();
