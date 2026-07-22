import { describe, it, expect } from "vitest";
import { dotClasses } from "./statusDot";

describe("dotClasses", () => {
  it("running은 running 배경과 펄스 애니메이션 클래스를 준다", () => {
    const c = dotClasses("running");
    expect(c).toContain("bg-status-running");
    expect(c).toContain("status-dot-anim");
  });
  it("blocked는 blocked 배경과 링 펄스 클래스를 준다", () => {
    const c = dotClasses("blocked");
    expect(c).toContain("bg-status-blocked");
    expect(c).toContain("status-ring-anim");
  });
  it("idle은 애니메이션 클래스가 없다", () => {
    expect(dotClasses("idle")).not.toContain("status-dot-anim");
  });
  it("done은 done 배경", () => {
    expect(dotClasses("done")).toContain("bg-status-done");
  });
});
