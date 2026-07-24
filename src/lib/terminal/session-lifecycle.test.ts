import { describe, it, expect, vi } from "vitest";
import { registerSessionDisposer, releaseSession } from "./session-lifecycle";

// 모듈 전역 상태를 공유하므로 테스트마다 고유 세션 ID를 사용해 간섭을 피한다.
describe("session-lifecycle", () => {
  it("등록 후 release하면 종료 함수를 호출한다", () => {
    const dispose = vi.fn();
    registerSessionDisposer("a", dispose);
    releaseSession("a");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("등록 전 release는 no-op이고, 이후 등록 시 즉시 정리한다(생성 도중 삭제 경합)", () => {
    const dispose = vi.fn();
    releaseSession("b"); // 터미널이 아직 생성 중인 상태에서 삭제 요청
    expect(dispose).not.toHaveBeenCalled();
    registerSessionDisposer("b", dispose);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("release를 두 번 호출해도 종료 함수는 한 번만 호출한다", () => {
    const dispose = vi.fn();
    registerSessionDisposer("c", dispose);
    releaseSession("c");
    releaseSession("c");
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
