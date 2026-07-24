import type { Update } from "$lib/ipc/updater";
import { checkUpdate, installUpdate } from "$lib/ipc/updater";
import { t } from "$lib/i18n";

export const AUTO_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

type Status = "idle" | "checking" | "downloading" | "error";

/** 자동 업데이트 상태 store. 시작 시와 이후 하루마다 무음 확인하며, 설정에서 수동 확인/설치한다. */
class UpdaterStore {
  #version = $state<string | null>(null);
  #status = $state<Status>("idle");
  #message = $state<string | null>(null);
  #update: Update | null = null;
  #checkTimer: ReturnType<typeof setInterval> | null = null;

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

  /** 앱 생명주기에 맞춰 즉시 확인하고 주기적인 자동 확인을 시작한다. */
  start(): void {
    if (this.#checkTimer !== null) return;
    void this.check();
    this.#checkTimer = setInterval(() => void this.check(), AUTO_UPDATE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.#checkTimer === null) return;
    clearInterval(this.#checkTimer);
    this.#checkTimer = null;
  }

  /** manual=true면 결과(최신/오류)를 message로 노출한다. */
  async check(manual = false): Promise<void> {
    if (this.#status === "checking" || this.#status === "downloading") return;
    this.#status = "checking";
    this.#message = null;
    try {
      const update = await checkUpdate();
      this.#update = update;
      this.#version = update?.version ?? null;
      this.#status = "idle";
      if (manual && !update) this.#message = t("update.upToDate");
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
