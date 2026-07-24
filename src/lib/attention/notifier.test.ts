import { describe, expect, it } from "vitest";
import { attentionNotification, shouldNotify } from "./notifier";

describe("shouldNotify", () => {
  it("최초 관측(prev 없음)은 알리지 않는다", () => {
    expect(shouldNotify(undefined, "blocked")).toBe(false);
    expect(shouldNotify(undefined, "done")).toBe(false);
  });

  it("같은 상태 반복은 알리지 않는다", () => {
    expect(shouldNotify("blocked", "blocked")).toBe(false);
  });

  it("blocked/done으로 새로 진입하면 알린다", () => {
    expect(shouldNotify("running", "blocked")).toBe(true);
    expect(shouldNotify("running", "done")).toBe(true);
    expect(shouldNotify("idle", "blocked")).toBe(true);
  });

  it("running/idle로의 전이는 알리지 않는다", () => {
    expect(shouldNotify("blocked", "running")).toBe(false);
    expect(shouldNotify("done", "idle")).toBe(false);
  });
});

describe("attentionNotification", () => {
  it("입력 대기 메시지를 만든다", () => {
    const msg = attentionNotification("blocked", { agentTitle: "로그인 리팩터링", projectName: "웹" });
    expect(msg.title).toBe("로그인 리팩터링 · 입력 대기");
    expect(msg.body).toContain("웹");
    expect(msg.body).toContain("입력");
  });

  it("완료 메시지를 만든다", () => {
    const msg = attentionNotification("done", { agentTitle: "빌드", projectName: "API" });
    expect(msg.title).toBe("빌드 · 완료");
    expect(msg.body).toContain("API");
  });
});
