import { describe, it, expect } from "vitest";
import { badgeClasses } from "./statusBadge";

describe("badgeClasses", () => {
  it("blocked는 솔리드(배경 solid + on 텍스트)", () => {
    const c = badgeClasses("blocked");
    expect(c).toContain("bg-status-blocked");
    expect(c).toContain("text-status-blocked-on");
  });
  it("running은 틴트(fg 텍스트)", () => {
    const c = badgeClasses("running");
    expect(c).toContain("text-status-running-fg");
    expect(c).not.toContain("text-status-blocked-on");
  });
  it("done은 done fg 텍스트", () => {
    expect(badgeClasses("done")).toContain("text-status-done-fg");
  });
  it("idle은 idle 계열", () => {
    expect(badgeClasses("idle")).toContain("status-idle");
  });
});
