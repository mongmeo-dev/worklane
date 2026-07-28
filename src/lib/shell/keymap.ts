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

/** 단축키 조합을 액션으로 변환한다. 수식키(⌘/Ctrl) 없는 입력은 터미널에 양보한다. */
export function resolveShortcut(event: KeyLike): ShortcutAction | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
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
