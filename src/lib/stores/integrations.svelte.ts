const LINEAR_KEY = "integrations:linear-key";

/** 외부 연동 자격 증명(현재 Linear API 키). localStorage에 저장한다. */
class IntegrationsStore {
  #linearKey = $state("");

  get linearKey(): string {
    return this.#linearKey;
  }

  setLinearKey(value: string): void {
    this.#linearKey = value;
    if (typeof localStorage !== "undefined") localStorage.setItem(LINEAR_KEY, value);
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(LINEAR_KEY);
    if (raw !== null) this.#linearKey = raw;
  }
}

export const integrations = new IntegrationsStore();
