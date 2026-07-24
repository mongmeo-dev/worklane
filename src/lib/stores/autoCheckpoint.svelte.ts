import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";
import { createCheckpoint } from "$lib/ipc/checkpoints";
import { t } from "$lib/i18n";

const STORAGE_KEY = "settings:auto-checkpoint";

interface AgentRef {
  agentId: string;
  worktreePath: string;
}
type Resolver = (agentId: string) => AgentRef | undefined;

/**
 * 에이전트가 완료(done)로 전이하면 자동으로 체크포인트를 저장하는 설정+컨트롤러.
 * 변경이 없으면 백엔드가 거부하므로 조용히 무시한다.
 */
class AutoCheckpointStore {
  #enabled = $state(true);
  #prev = new Map<string, AgentStatus>();
  #started: Promise<void> | null = null;

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(value: boolean): void {
    this.#enabled = value;
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(value));
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) this.#enabled = raw !== "false";
  }

  /** 앱 마운트 시 1회 호출(멱등). resolve는 세션ID로 에이전트 경로를 조회한다. */
  async start(resolve: Resolver): Promise<void> {
    if (this.#started) return this.#started;
    this.#started = listenStatus((e) => {
      const before = this.#prev.get(e.sessionId);
      this.#prev.set(e.sessionId, e.status);
      if (!this.#enabled) return;
      // 최초 관측이거나 이미 done이면 스킵. 다른 상태 → done 전이일 때만 저장.
      if (before === undefined || before === "done" || e.status !== "done") return;
      const ref = resolve(e.sessionId);
      if (!ref) return;
      void createCheckpoint(ref.agentId, ref.worktreePath, t("checkpoints.autoLabel")).catch(() => {});
    }).then(() => {});
    return this.#started;
  }
}

export const autoCheckpoint = new AutoCheckpointStore();
