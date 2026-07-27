import { describe, expect, it } from "vitest";
import type { Agent, AgentStatus, Project } from "$lib/types";
import { attentionCounts, attentionItems, needsAttention } from "./model";

function agent(id: string, status: AgentStatus | undefined, updatedAt: number): Agent {
  return {
    id,
    projectId: "p",
    title: `agent-${id}`,
    kind: "claude-code",
    command: "claude",
    branch: `feat/${id}`,
    worktreePath: `/wt/${id}`,
    worktreeManaged: true,
    createdAt: 0,
    updatedAt,
    status,
  };
}

function project(id: string, name: string, agents: Agent[]): Project {
  return { id, name, path: `/repo/${id}`, createdAt: 0, updatedAt: 0, agents };
}

describe("needsAttention", () => {
  it("failed, blocked, done을 주의 필요로 본다", () => {
    expect(needsAttention("failed")).toBe(true);
    expect(needsAttention("blocked")).toBe(true);
    expect(needsAttention("done")).toBe(true);
    expect(needsAttention("running")).toBe(false);
    expect(needsAttention("idle")).toBe(false);
    expect(needsAttention(undefined)).toBe(false);
  });
});

describe("attentionItems", () => {
  it("여러 프로젝트를 가로질러 주의 필요 상태만 모은다", () => {
    const projects = [
      project("p1", "웹", [agent("a", "running", 1), agent("b", "blocked", 2)]),
      project("p2", "API", [agent("c", "done", 3), agent("d", "idle", 4)]),
    ];
    const items = attentionItems(projects);
    expect(items.map((i) => i.agentId)).toEqual(["b", "c"]);
    expect(items[0].projectName).toBe("웹");
  });

  it("입력 대기를 완료보다 앞에, 같은 상태는 최근 갱신 순으로 정렬한다", () => {
    const projects = [
      project("p1", "웹", [
        agent("done-old", "done", 10),
        agent("done-new", "done", 30),
        agent("blocked-old", "blocked", 5),
        agent("blocked-new", "blocked", 20),
      ]),
    ];
    const items = attentionItems(projects);
    expect(items.map((i) => i.agentId)).toEqual([
      "blocked-new",
      "blocked-old",
      "done-new",
      "done-old",
    ]);
  });

  it("status 미지정 에이전트는 idle로 보고 제외한다", () => {
    const items = attentionItems([project("p1", "웹", [agent("a", undefined, 1)])]);
    expect(items).toEqual([]);
  });
});

describe("attentionCounts", () => {
  it("failed/blocked/done/total을 센다", () => {
    const projects = [
      project("p1", "웹", [
        agent("a", "blocked", 1),
        agent("b", "blocked", 2),
        agent("c", "done", 3),
        agent("d", "failed", 4),
      ]),
    ];
    expect(attentionCounts(attentionItems(projects))).toEqual({ total: 4, failed: 1, blocked: 2, done: 1 });
  });

  it("빈 목록이면 모두 0", () => {
    expect(attentionCounts([])).toEqual({ total: 0, failed: 0, blocked: 0, done: 0 });
  });
});
