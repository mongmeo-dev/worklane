export type Locale = "ko" | "en";

const STORAGE_KEY = "settings:locale";

/** 지원 로케일 목록(설정 UI 순서). */
export const LOCALES: readonly Locale[] = ["ko", "en"];

/** 각 로케일의 사람이 읽는 표시명(자국어 표기). */
export const localeLabels: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/**
 * 현재 UI 로케일 store. localStorage에 영속하며 <html lang>을 동기화한다.
 * 기본값은 한국어(기존 UX 유지)이고 설정에서 영어로 전환할 수 있다.
 */
class LocaleStore {
  #current = $state<Locale>("ko");

  get current(): Locale {
    return this.#current;
  }

  set(locale: Locale): void {
    this.#current = locale;
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }

  /** 저장된 로케일을 로드해 반영한다(부팅 시 1회). */
  init(): void {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    this.#current = isLocale(raw) ? raw : "ko";
    if (typeof document !== "undefined") document.documentElement.lang = this.#current;
  }
}

export const locale = new LocaleStore();
