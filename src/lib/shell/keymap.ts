/**
 * 전역 단축키 해석기.
 *
 * 순수 함수로 두어 브라우저 없이 테스트한다. macOS에서 Option을 누르면
 * `event.key`가 대체 글리프(예: Alt+B → "∫")로 바뀌므로 알파벳 판별은
 * 물리 키인 `event.code`를 우선한다.
 */

export type ShortcutAction =
  | { type: "palette" }
  | { type: "overview" }
  | { type: "jump"; index: number }
  | { type: "cycle"; delta: 1 | -1 }
  | { type: "attention" }
  | { type: "toggleLeft" }
  | { type: "toggleRight" }
  | { type: "settings" }
  | { type: "newAgent" }
  | { type: "fanout" }
  | { type: "tasks" }
  | { type: "help" };

export interface KeyLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** 전역 단축키의 주 수식키가 무엇인지 결정하는 플랫폼 구분. */
export type ShortcutPlatform = "mac" | "other";

/**
 * 현재 플랫폼의 주 수식키를 판별한다. macOS는 ⌘(meta), 그 외는 Ctrl이다.
 *
 * Ctrl은 터미널의 제어 문자(^B·^K·^N 등)를 만드는 키라, macOS에서 Ctrl 조합까지
 * 전역 단축키로 가로채면 vim·tmux·readline 같은 TUI 입력이 앱 액션과 겹쳐 깨진다.
 * UI에 표기된 단축키도 모두 ⌘ 기준이므로 macOS에서는 ⌘만 받는다.
 */
export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "other";
  const hints = `${navigator.userAgent} ${navigator.platform ?? ""}`;
  return /Mac|iPhone|iPad|iPod/i.test(hints) ? "mac" : "other";
}

let cachedPlatform: ShortcutPlatform | undefined;

function currentPlatform(): ShortcutPlatform {
  cachedPlatform ??= detectShortcutPlatform();
  return cachedPlatform;
}

/** 주 수식키만 눌렸는지. 반대편 수식키가 같이 눌린 조합은 앱 단축키가 아니다. */
function hasPrimaryModifier(event: KeyLike, platform: ShortcutPlatform): boolean {
  return platform === "mac" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function letterOf(event: KeyLike): string {
  if (event.code && /^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  return event.key.length === 1 ? event.key.toLowerCase() : "";
}

function digitOf(event: KeyLike): number | null {
  if (event.code && /^Digit[0-9]$/.test(event.code)) return Number(event.code.slice(5));
  return /^[0-9]$/.test(event.key) ? Number(event.key) : null;
}

function isSlash(event: KeyLike): boolean {
  return event.code === "Slash" || event.key === "/" || event.key === "?";
}

/**
 * 단축키 조합을 액션으로 변환한다. 주 수식키(macOS ⌘ / 그 외 Ctrl) 없는 입력과
 * 플랫폼의 주 수식키가 아닌 조합은 모두 터미널에 양보한다.
 */
export function resolveShortcut(
  event: KeyLike,
  platform: ShortcutPlatform = currentPlatform(),
): ShortcutAction | null {
  if (!hasPrimaryModifier(event, platform)) return null;
  const letter = letterOf(event);

  if (event.altKey) {
    if (event.key === "ArrowDown") return { type: "cycle", delta: 1 };
    if (event.key === "ArrowUp") return { type: "cycle", delta: -1 };
    if (letter === "b") return { type: "toggleRight" };
    return null;
  }

  if (event.shiftKey) {
    if (letter === "a") return { type: "attention" };
    if (letter === "n") return { type: "fanout" };
    if (letter === "t") return { type: "tasks" };
    if (isSlash(event)) return { type: "help" };
    return null;
  }

  const digit = digitOf(event);
  if (digit !== null) return digit === 0 ? { type: "overview" } : { type: "jump", index: digit - 1 };
  if (letter === "k") return { type: "palette" };
  if (letter === "b") return { type: "toggleLeft" };
  if (letter === "n") return { type: "newAgent" };
  if (letter === ",") return { type: "settings" };
  if (isSlash(event)) return { type: "help" };
  return null;
}

/**
 * 모달이 열려 있을 때도 허용할 액션인지. 모달 안에서 워크스페이스를 갈아타면
 * 다이얼로그가 맥락 없는 대상에 붙어버리므로 오버레이 계열만 통과시킨다.
 */
export function allowedWhileModal(action: ShortcutAction): boolean {
  return action.type === "palette" || action.type === "help";
}
