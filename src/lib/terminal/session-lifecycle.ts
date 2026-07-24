/**
 * 세션(에이전트) 종료 훅 레지스트리.
 *
 * 터미널 풀(xterm/WebGL 등 무거운 의존성)과 순수 데이터 스토어를 분리하기 위한
 * 얇은 경계 계층이다. 풀은 인스턴스를 만들 때 종료 함수를 등록하고, 데이터 스토어는
 * 에이전트 삭제 시 이 모듈만 호출해 세션을 종료한다(xterm을 import하지 않는다).
 */

const disposers = new Map<string, () => void>();
// 등록 전에 삭제 요청이 먼저 온 경우(생성 도중 삭제) 처리를 위한 표시.
const pendingRelease = new Set<string>();

/** 풀이 인스턴스 생성 직후 호출한다. 이미 삭제 요청이 있었다면 즉시 정리한다. */
export function registerSessionDisposer(sessionId: string, dispose: () => void): void {
  if (pendingRelease.has(sessionId)) {
    pendingRelease.delete(sessionId);
    dispose();
    return;
  }
  disposers.set(sessionId, dispose);
}

/**
 * 세션을 종료한다(에이전트 삭제 시). 등록된 터미널이 없으면 생성 중일 수 있으므로
 * 등록되는 즉시 정리되도록 표시만 남긴다.
 */
export function releaseSession(sessionId: string): void {
  const dispose = disposers.get(sessionId);
  if (dispose) {
    disposers.delete(sessionId);
    dispose();
    return;
  }
  pendingRelease.add(sessionId);
}
