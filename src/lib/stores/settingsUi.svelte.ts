export type SettingsTab = "screen" | "agents" | "prompts" | "usage" | "integrations";

/** 설정 모달의 열림 상태와 활성 탭만 관리하는 UI store (영속 불필요). */
class SettingsUiStore {
  #isOpen = $state<boolean>(false);
  #activeTab = $state<SettingsTab>("screen");

  get isOpen(): boolean {
    return this.#isOpen;
  }
  get activeTab(): SettingsTab {
    return this.#activeTab;
  }

  open(): void {
    this.#isOpen = true;
  }
  close(): void {
    this.#isOpen = false;
  }
  setTab(tab: SettingsTab): void {
    this.#activeTab = tab;
  }
}

export const settingsUi = new SettingsUiStore();
