import { describe, expect, it } from "vitest";
import { agentRowClasses, projectPathLabel } from "./sidebarModel";

describe("사이드바 표현 모델", () => {
  it("입력 대기 행은 선택 여부와 관계없이 상태 강조를 유지한다", () => {
    expect(agentRowClasses("blocked", false)).toContain("bg-status-blocked/7");
    expect(agentRowClasses("blocked", true)).toContain("ring-status-blocked/55");
  });

  it("선택한 일반 행은 선택 표면과 링을 사용한다", () => {
    expect(agentRowClasses("running", true)).toContain("bg-accent");
    expect(agentRowClasses("running", true)).toContain("ring-1");
  });

  it("긴 프로젝트 경로는 마지막 두 조각으로 축약한다", () => {
    expect(projectPathLabel("/Users/benny/development/worklane")).toBe("development/worklane");
  });
});
