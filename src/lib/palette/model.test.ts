import { describe, expect, it } from "vitest";
import type { Agent, Project } from "$lib/types";
import { agentItems, filterPalette, type PaletteItem } from "./model";

function project(id: string, name: string, agents: Agent[]): Project {
  return { id, name, path: `/r/${id}`, defaultBranch: "main", createdAt: 0, updatedAt: 0, agents };
}

function agent(id: string, title: string): Agent {
  return {
    id,
    projectId: "p",
    title,
    kind: "codex",
    command: "codex",
    branch: `b/${id}`,
    worktreePath: `/wt/${id}`,
    worktreeManaged: true,
    createdAt: 0,
    updatedAt: 0,
    status: "running",
  };
}

describe("agentItems", () => {
  it("모든 프로젝트의 에이전트를 항목으로 만든다", () => {
    const items = agentItems([
      project("p1", "웹", [agent("a", "로그인")]),
      project("p2", "API", [agent("b", "결제")]),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "agent", id: "a", project: "웹", status: "running" });
  });
});

describe("filterPalette", () => {
  const items: PaletteItem[] = [
    { type: "action", id: "overview", label: "전체 오버뷰", hint: "이동" },
    { type: "agent", id: "a", label: "로그인 리팩터링", project: "웹", status: "running" },
    { type: "agent", id: "b", label: "결제", project: "API", status: "idle" },
  ];

  it("빈 질의는 전체를 반환한다", () => {
    expect(filterPalette(items, "  ")).toHaveLength(3);
  });

  it("라벨로 필터링한다", () => {
    expect(filterPalette(items, "로그인").map((i) => i.id)).toEqual(["a"]);
  });

  it("프로젝트명으로도 필터링한다", () => {
    expect(filterPalette(items, "api").map((i) => i.id)).toEqual(["b"]);
  });

  it("액션 라벨도 매칭한다", () => {
    expect(filterPalette(items, "오버뷰").map((i) => i.id)).toEqual(["overview"]);
  });
});
