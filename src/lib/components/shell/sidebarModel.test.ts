import { describe, expect, it } from "vitest";
import type { Project } from "$lib/types";
import { agentRowClasses, filterProjects, projectPathLabel } from "./sidebarModel";

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

describe("사이드바 거르기", () => {
  const projects: Project[] = [
    {
      id: "p1", name: "Worklane", path: "/repo/worklane", defaultBranch: "main", createdAt: 1, updatedAt: 1,
      agents: [
        { id: "a1", projectId: "p1", title: "로그인 리팩터링", kind: "codex", command: "codex", branch: "feat/login", worktreePath: "/wt/1", worktreeManaged: true, createdAt: 1, updatedAt: 1 },
        { id: "a2", projectId: "p1", title: "결제", kind: "codex", command: "codex", branch: "feat/pay", worktreePath: "/wt/2", worktreeManaged: true, createdAt: 1, updatedAt: 1 },
      ],
    },
    {
      id: "p2", name: "Docs", path: "/repo/docs", defaultBranch: "main", createdAt: 1, updatedAt: 1,
      agents: [
        { id: "b1", projectId: "p2", title: "가이드", kind: "codex", command: "codex", branch: "docs/guide", worktreePath: "/wt/3", worktreeManaged: true, createdAt: 1, updatedAt: 1 },
      ],
    },
  ];

  it("빈 질의는 원본을 그대로 돌려준다", () => {
    expect(filterProjects(projects, "  ")).toBe(projects);
  });

  it("프로젝트명이 걸리면 에이전트 전체를 남긴다", () => {
    const result = filterProjects(projects, "docs");
    expect(result.map((p) => p.id)).toEqual(["p2"]);
    expect(result[0].agents).toHaveLength(1);
  });

  it("에이전트 제목·브랜치로 프로젝트 안을 좁힌다", () => {
    const result = filterProjects(projects, "pay");
    expect(result).toHaveLength(1);
    expect(result[0].agents.map((a) => a.id)).toEqual(["a2"]);
  });

  it("일치하는 항목이 없으면 빈 목록", () => {
    expect(filterProjects(projects, "zzz")).toEqual([]);
  });
});
