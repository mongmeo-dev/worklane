import { describe, expect, it } from "vitest";
import { actionErrorMessage, normalizeActionError, type ActionErrorEvent } from "./actionErrors.svelte";

describe("normalizeActionError", () => {
  it("Error 메시지를 보존한다", () => {
    expect(normalizeActionError(new Error("git push rejected"))).toEqual({
      code: "UNKNOWN",
      reason: "git push rejected",
    });
  });

  it("알려진 문자열 오류 코드를 분류한다", () => {
    expect(normalizeActionError("WORKTREE_DIRTY")).toEqual({
      code: "WORKTREE_DIRTY",
      reason: "WORKTREE_DIRTY",
    });
  });

  it("구조화 오류의 코드와 메시지를 함께 보존한다", () => {
    expect(normalizeActionError({ code: "SESSION_CLOSED", message: "already closed" })).toEqual({
      code: "SESSION_CLOSED",
      reason: "already closed",
    });
  });

  it("직렬화할 수 없는 값도 안전하게 처리한다", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(normalizeActionError(value)).toEqual({ code: "UNKNOWN", reason: "" });
  });
});

describe("actionErrorMessage", () => {
  it("알려진 오류는 다음 행동이 포함된 번역으로 표시한다", () => {
    const event: ActionErrorEvent = { id: 1, code: "SESSION_CLOSED", reason: "SESSION_CLOSED" };
    expect(actionErrorMessage(event)).toContain("다시 열고 재시도");
  });

  it("알 수 없는 오류는 실제 원인을 표시한다", () => {
    const event: ActionErrorEvent = { id: 1, code: "UNKNOWN", reason: "permission denied" };
    expect(actionErrorMessage(event)).toContain("permission denied");
  });
});
