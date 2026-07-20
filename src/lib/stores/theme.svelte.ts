export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "settings:theme-mode";
const MODES: readonly ThemeMode[] = ["light", "dark", "system"];

function isMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

/** 테마 모드 store. <html>.dark 클래스를 토글해 app.css의 dark 변형과 연동한다. */
class ThemeStore {
  #mode = $state<ThemeMode>("system");
  #mql: MediaQueryList | null = null;
  #onSystemChange = () => this.#applyDom();

  get mode(): ThemeMode {
    return this.#mode;
  }

  /** system 모드에서 다크 여부를 판정한다. */
  #systemPrefersDark(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /** 현재 모드를 실제 DOM(dark 클래스)에 반영한다. */
  #applyDom(): void {
    const dark =
      this.#mode === "dark" ||
      (this.#mode === "system" && this.#systemPrefersDark());
    document.documentElement.classList.toggle("dark", dark);
  }

  /** system 모드일 때만 OS 테마 변경을 구독한다. */
  #syncSystemSubscription(): void {
    this.#mql?.removeEventListener("change", this.#onSystemChange);
    this.#mql = null;
    if (this.#mode === "system") {
      this.#mql = window.matchMedia("(prefers-color-scheme: dark)");
      this.#mql.addEventListener("change", this.#onSystemChange);
    }
  }

  setMode(mode: ThemeMode): void {
    this.#mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    this.#syncSystemSubscription();
    this.#applyDom();
  }

  /** 저장된 모드를 로드해 DOM에 반영한다(부팅 시 1회, FOUC 방지). */
  init(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    this.#mode = isMode(raw) ? raw : "system";
    this.#syncSystemSubscription();
    this.#applyDom();
  }
}

export const theme = new ThemeStore();
