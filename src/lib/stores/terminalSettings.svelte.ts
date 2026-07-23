const STORAGE_KEY = "settings:terminal-font";
const DEFAULT_FAMILY = "JetBrains Mono";
const DEFAULT_SIZE = 13;
const MIN_SIZE = 10;
const MAX_SIZE = 20;

/** 터미널 폰트(패밀리/크기) 설정 store. Terminal.svelte가 구독해 xterm에 반영한다. */
class TerminalSettingsStore {
  #fontFamily = $state<string>(DEFAULT_FAMILY);
  #fontSize = $state<number>(DEFAULT_SIZE);

  get fontFamily(): string {
    return this.#fontFamily;
  }
  get fontSize(): number {
    return this.#fontSize;
  }

  #persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fontFamily: this.#fontFamily, fontSize: this.#fontSize }),
    );
  }

  setFontFamily(v: string): void {
    this.#fontFamily = v.trim() === "" ? DEFAULT_FAMILY : v;
    this.#persist();
  }

  setFontSize(v: number): void {
    if (!Number.isFinite(v)) return;
    this.#fontSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(v)));
    this.#persist();
  }

  init(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        fontFamily?: unknown;
        fontSize?: unknown;
      };
      if (typeof parsed.fontFamily === "string" && parsed.fontFamily.trim()) {
        this.#fontFamily = parsed.fontFamily;
      }
      if (Number.isFinite(parsed.fontSize)) {
        this.#fontSize = Math.min(
          MAX_SIZE,
          Math.max(MIN_SIZE, Math.round(parsed.fontSize as number)),
        );
      }
    } catch {
      // 손상값은 기본값 유지
    }
  }
}

export const terminalSettings = new TerminalSettingsStore();
