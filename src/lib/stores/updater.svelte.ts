import type { Update } from "$lib/ipc/updater";
import { checkUpdate, installUpdate } from "$lib/ipc/updater";

type Status = "idle" | "checking" | "downloading" | "error";

/** 자동 업데이트 상태 store. 시작 시 무음 확인, 설정에서 수동 확인/설치. */
class UpdaterStore {
  #version = $state<string | null>(null);
  #status = $state<Status>("idle");
  #message = $state<string | null>(null);
  #update: Update | null = null;

  get version(): string | null {
    return this.#version;
  }
  get status(): Status {
    return this.#status;
  }
  get message(): string | null {
    return this.#message;
  }
  get available(): boolean {
    return this.#version !== null;
  }

  /** manual=true면 결과(최신/오류)를 message로 노출한다. */
  async check(manual = false): Promise<void> {
    this.#status = "checking";
    this.#message = null;
    try {
      const update = await checkUpdate();
      this.#update = update;
      this.#version = update?.version ?? null;
      this.#status = "idle";
      if (manual && !update) this.#message = "이미 최신 버전입니다.";
    } catch (e) {
      this.#status = "idle";
      if (manual) this.#message = e instanceof Error ? e.message : String(e);
    }
  }

  async install(): Promise<void> {
    if (!this.#update) return;
    this.#status = "downloading";
    this.#message = null;
    try {
      await installUpdate(this.#update);
    } catch (e) {
      this.#status = "error";
      this.#message = e instanceof Error ? e.message : String(e);
    }
  }

  dismiss(): void {
    this.#version = null;
  }
}

export const updater = new UpdaterStore();
