import { describe, expect, it } from "vitest";
import type { Agent, Project } from "$lib/types";
import {
  aggregateStatus,
  hasDefaultWorkspace,
  representativeTerminalId,
  statusCounts,
  worktreeGroups,
} from "./derived";

const project: Project = {
  id: "project-1",
  name: "Worklane",
  path: "/repo",
  defaultBranch: "main",
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
    expect(statusCounts([project])).toEqual({ running: 1, blocked: 1, idle: 0, done: 1, failed: 0 });
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

  it("워크스페이스 상태는 터미널 상태를 우선순위로 합친다", () => {
    expect(aggregateStatus(["idle", "running", "blocked"])).toBe("blocked");
    expect(aggregateStatus(["blocked", "failed", "running"])).toBe("failed");
    expect(aggregateStatus(["idle", "running", "done"])).toBe("running");
    expect(aggregateStatus(["done", "idle"])).toBe("idle");
    expect(aggregateStatus(["done", "done"])).toBe("done");
    expect(aggregateStatus([undefined, undefined])).toBe("idle");
    expect(aggregateStatus([])).toBe("idle");
  });

  it("대표 세션 id는 첫 터미널을 쓰고 없으면 워크스페이스 id로 폴백한다", () => {
    const withTerminals = {
      ...project.agents[0],
      terminals: [
        { id: "t1", agentId: "a1", title: "", kind: "codex", command: "codex", position: 0, createdAt: 1 },
        { id: "t2", agentId: "a1", title: "", kind: "terminal", command: "", position: 1, createdAt: 2 },
      ],
    } satisfies Agent;
    expect(representativeTerminalId(withTerminals)).toBe("t1");
    expect(representativeTerminalId(project.agents[0])).toBe("a1");
  });

});
