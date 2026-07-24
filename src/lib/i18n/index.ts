import { locale } from "./locale.svelte";
import { en, ko, type MessageKey } from "./messages";

export { locale, LOCALES, localeLabels, type Locale } from "./locale.svelte";
export type { MessageKey } from "./messages";

const catalogs = { en, ko } as const;

/**
 * 현재 로케일의 메시지를 반환한다. `locale.current`를 읽으므로 Svelte 반응성 컨텍스트
 * (컴포넌트 템플릿 등)에서 호출하면 로케일 변경 시 자동으로 다시 계산된다.
 * {name} 자리표시자는 params로 치환한다.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const dict = catalogs[locale.current] ?? en;
  let message: string = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const name in params) {
      message = message.split(`{${name}}`).join(String(params[name]));
    }
  }
  return message;
}

/** Intl 포맷에 쓸 BCP-47 로케일 태그. 날짜/숫자 표기에 사용한다. */
export function localeTag(): string {
  return locale.current === "en" ? "en-US" : "ko-KR";
}
