import { detectSessionProcesses } from "$lib/ipc/pty";
import { agentKindStore } from "$lib/stores/agentKinds.svelte";

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

  /** 세션에서 감지된 종류 id. 아직 감지 전이거나 매칭 없으면 null. */
  get(sessionId: string): string | null {
    return this.map[sessionId] ?? null;
  }

  /** 한 세션의 프로세스 트리를 확인해 감지 결과를 갱신한다. */
  async refresh(sessionId: string): Promise<void> {
    try {
      const tokens = await detectSessionProcesses(sessionId);
      this.map[sessionId] = agentKindStore.detectKind(tokens);
    } catch {
      // 세션이 없거나 감지 실패 시 이전 값을 유지한다.
    }
  }

  /** 여러 세션을 한꺼번에 갱신한다. */
  async refreshAll(sessionIds: string[]): Promise<void> {
    await Promise.all(sessionIds.map((id) => this.refresh(id)));
  }

  /** 세션이 사라지면 캐시에서 제거한다. */
  forget(sessionId: string): void {
    delete this.map[sessionId];
  }
}

export const agentDetection = new AgentDetectionStore();
