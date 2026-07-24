import { clampThreshold, DEFAULT_BUDGET_THRESHOLD } from "$lib/usage/budget";

const STORAGE_KEY = "settings:usage-budget";

/** 사용량 예산 임계값(%) 설정 store. 초과 시 상태바 경고와 OS 알림을 발생시킨다. */
class BudgetStore {
  #threshold = $state<number>(DEFAULT_BUDGET_THRESHOLD);

  get threshold(): number {
    return this.#threshold;
  }

  setThreshold(value: number): void {
    this.#threshold = clampThreshold(value);
    localStorage.setItem(STORAGE_KEY, String(this.#threshold));
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) this.#threshold = clampThreshold(parsed);
  }
}

export const budget = new BudgetStore();
