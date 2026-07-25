const STORAGE_KEY = "prompt:injected";

let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

/** 해당 세션(에이전트)에 시드 프롬프트를 이미 자동 주입했는지 여부. */
export function injectionDone(sessionId: string): boolean {
  return load().has(sessionId);
}

/** 자동 주입 완료로 기록한다(중복 주입 방지, 앱 재시작 후에도 유지). */
export function markInjected(sessionId: string): void {
  const set = load();
  if (set.has(sessionId)) return;
  set.add(sessionId);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }
  } catch {
    // 영속 실패는 무시(메모리 캐시로만 중복 방지).
  }
}
/** 세션 삭제 시 해당 세션의 메모리 및 영속 주입 완료 표시를 제거한다. */
export function forgetInjection(sessionId: string): void {
  const set = load();
  if (!set.delete(sessionId)) return;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }
  } catch {
    // 영속 실패는 무시(메모리 캐시에서만 제거).
  }
}

/** 테스트용: 메모리 캐시를 비운다. */
export function resetInjectionCache(): void {
  cache = null;
}
