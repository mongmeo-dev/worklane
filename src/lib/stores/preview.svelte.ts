const STORAGE_KEY = "preview:urls";

/** dev 서버 프리뷰의 기본 후보 URL. */
export const DEFAULT_PREVIEW_URL = "http://localhost:5173";

/** 에이전트별 프리뷰 URL을 localStorage에 영속하는 store. */
class PreviewStore {
  #urls = $state<Record<string, string>>({});

  get(agentId: string): string {
    return this.#urls[agentId] ?? "";
  }

  set(agentId: string, url: string): void {
    this.#urls = { ...this.#urls, [agentId]: url };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#urls));
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        this.#urls = parsed as Record<string, string>;
      }
    } catch {
      // 손상값은 무시하고 빈 상태 유지
    }
  }
}

export const previewStore = new PreviewStore();
