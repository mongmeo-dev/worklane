import { describe, expect, it } from "vitest";
import {
  canCreateWorkspace,
  requiresCommand,
  resolveWorkspaceTitle,
  type WorkspaceFormInput,
} from "./agentDialogModel";

const base: WorkspaceFormInput = {
  title: "로그인 리팩터링",
  kind: "claude-code",
  command: "claude",
  branch: "feat/login",
  startPoint: "main",
};

describe("requiresCommand", () => {
  it("CLI 에이전트 종류는 실행 커맨드가 필요하다", () => {
    expect(requiresCommand("claude-code")).toBe(true);
    expect(requiresCommand("codex")).toBe(true);
  });

  it("빈 터미널은 실행 커맨드가 필요 없다", () => {
    expect(requiresCommand("terminal")).toBe(false);
  });
});

describe("canCreateWorkspace", () => {
  it("모든 필수값이 있으면 제출 가능하다", () => {
    expect(canCreateWorkspace(base)).toBe(true);
  });

  it("작업 이름이 비어도 제출할 수 있다(브랜치 이름을 기본값으로 사용)", () => {
    expect(canCreateWorkspace({ ...base, title: "   " })).toBe(true);
  });

  it("빈 터미널은 실행 커맨드가 비어도 제출할 수 있다", () => {
    expect(canCreateWorkspace({ ...base, kind: "terminal", command: "" })).toBe(true);
  });

  it("CLI 에이전트는 실행 커맨드가 비면 제출할 수 없다", () => {
    expect(canCreateWorkspace({ ...base, command: "" })).toBe(false);
  });

  it("워크스페이스는 브랜치와 분기 기준이 모두 필요하다", () => {
    expect(canCreateWorkspace({ ...base, branch: "" })).toBe(false);
    expect(canCreateWorkspace({ ...base, startPoint: "" })).toBe(false);
  });
});

describe("resolveWorkspaceTitle", () => {
  it("작업 이름이 있으면 그대로(트림) 사용한다", () => {
    expect(resolveWorkspaceTitle("  로그인 리팩터링  ", "feat/login")).toBe("로그인 리팩터링");
  });

  it("작업 이름이 비면 브랜치 이름을 기본값으로 사용한다", () => {
    expect(resolveWorkspaceTitle("", "feat/login")).toBe("feat/login");
    expect(resolveWorkspaceTitle("   ", "feat/login")).toBe("feat/login");
  });
});
