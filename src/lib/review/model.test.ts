import { describe, expect, it } from "vitest";
import type { ReviewStatus } from "$lib/ipc/review";
import { canCommit, canPush, pushLabel } from "./model";

function status(over: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    branch: "feat/x",
    changedCount: 0,
    hasUpstream: true,
    ahead: 0,
    behind: 0,
    hasRemote: true,
    ...over,
  };
}

describe("pushLabel", () => {
  it("upstream 미설정이면 게시로 표기한다", () => {
    expect(pushLabel(status({ hasUpstream: false }))).toBe("브랜치 게시");
  });

  it("앞선 커밋 수를 표기한다", () => {
    expect(pushLabel(status({ ahead: 3 }))).toBe("푸시 3");
  });

  it("앞선 커밋이 없으면 푸시됨으로 표기한다", () => {
    expect(pushLabel(status({ ahead: 0 }))).toBe("푸시됨");
  });
});

describe("canPush", () => {
  it("원격이 없으면 불가", () => {
    expect(canPush(status({ hasRemote: false }))).toBe(false);
  });

  it("게시 전(upstream 없음)이면 가능", () => {
    expect(canPush(status({ hasUpstream: false }))).toBe(true);
  });

  it("앞선 커밋이 있으면 가능", () => {
    expect(canPush(status({ ahead: 2 }))).toBe(true);
  });

  it("upstream 있고 앞선 커밋 없으면 불가", () => {
    expect(canPush(status({ ahead: 0 }))).toBe(false);
  });
});

describe("canCommit", () => {
  it("변경과 메시지가 모두 있어야 가능", () => {
    expect(canCommit(2, "메시지")).toBe(true);
  });

  it("변경이 없으면 불가", () => {
    expect(canCommit(0, "메시지")).toBe(false);
  });

  it("메시지가 공백뿐이면 불가", () => {
    expect(canCommit(2, "   ")).toBe(false);
  });
});
