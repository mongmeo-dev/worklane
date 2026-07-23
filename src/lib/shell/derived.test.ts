import { describe, expect, it } from "vitest";
import type { Project } from "$lib/types";
import { hasDefaultWorkspace, statusCounts, worktreeGroups } from "./derived";

const project: Project = {
  id: "project-1",
  name: "Worklane",
  path: "/repo",
  createdAt: 1,
  updatedAt: 1,
  agents: [
    { id: "a1", projectId: "project-1", title: "구현", kind: "codex", command: "codex", branch: "feat/ui", worktreePath: "/wt/ui", worktreeManaged: true, createdAt: 1, updatedAt: 1, status: "running" },
    { id: "a2", projectId: "project-1", title: "테스트", kind: "claude-code", command: "claude", branch: "feat/ui", worktreePath: "/wt/ui", worktreeManaged: false, createdAt: 1, updatedAt: 1, status: "blocked" },
    { id: "a3", projectId: "project-1", title: "문서", kind: "gemini", command: "gemini", branch: "docs", worktreePath: "/wt/docs", worktreeManaged: true, createdAt: 1, updatedAt: 1, status: "done" },
  ],
};

describe("shell 파생 데이터", () => {
  it("상태별 에이전트 수를 센다", () => {
    expect(statusCounts([project])).toEqual({ running: 1, blocked: 1, idle: 0, done: 1 });
  });

  it("같은 worktreePath를 공유 그룹으로 묶는다", () => {
    const groups = worktreeGroups(project);
    expect(groups).toHaveLength(2);
    expect(groups[0].shared).toBe(true);
    expect(groups[0].agents.map((agent) => agent.id)).toEqual(["a1", "a2"]);
    expect(groups[1].shared).toBe(false);
  });
  it("저장소 본체 경로를 쓰는 에이전트가 있으면 기본 작업환경이 있다고 본다", () => {
    expect(hasDefaultWorkspace(project)).toBe(false);
    const withDefault: Project = {
      ...project,
      agents: [
        ...project.agents,
        { id: "root", projectId: "project-1", title: "기본 작업환경", kind: "codex", command: "codex", branch: "main", worktreePath: "/repo", worktreeManaged: false, createdAt: 1, updatedAt: 1 },
      ],
    };
    expect(hasDefaultWorkspace(withDefault)).toBe(true);
  });

});
