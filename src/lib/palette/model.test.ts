import { describe, expect, it } from "vitest";
import type { Agent, Project } from "$lib/types";
import { agentItems, filterPalette, matchScore, type PaletteItem } from "./model";

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
    { type: "agent", id: "a", label: "로그인 리팩터링", project: "웹", branch: "feat/login", status: "running" },
    { type: "agent", id: "b", label: "결제", project: "API", branch: "feat/pay", status: "idle" },
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

describe("matchScore", () => {
  it("접두 일치가 중간 일치보다 높다", () => {
    const prefix = matchScore("로그인 리팩터링", "로그인")!;
    const middle = matchScore("리팩터링 로그인", "로그인")!;
    expect(prefix).toBeGreaterThan(middle);
  });

  it("단어 시작 일치가 단어 중간 일치보다 높다", () => {
    expect(matchScore("feat login", "login")!).toBeGreaterThan(matchScore("featlogin", "login")!);
  });

  it("순서만 맞는 부분열도 매칭한다", () => {
    expect(matchScore("Payment Gateway", "pgw")).not.toBeNull();
    expect(matchScore("Payment Gateway", "zqx")).toBeNull();
  });

  it("빈 질의는 0점으로 통과시킨다", () => {
    expect(matchScore("무엇이든", "")).toBe(0);
  });
});

describe("filterPalette 랭킹", () => {
  const ranked: PaletteItem[] = [
    { type: "agent", id: "idle", label: "login idle", project: "웹", branch: "a", status: "idle" },
    { type: "agent", id: "blocked", label: "login blocked", project: "웹", branch: "b", status: "blocked" },
  ];

  it("같은 매칭이면 주의 필요 상태를 위로 올린다", () => {
    expect(filterPalette(ranked, "login").map((i) => i.id)).toEqual(["blocked", "idle"]);
  });

  it("브랜치명으로도 찾는다", () => {
    expect(filterPalette(ranked, "b").map((i) => i.id)[0]).toBe("blocked");
  });

  it("빈 질의에서는 최근 항목을 앞으로 당긴다", () => {
    expect(filterPalette(ranked, "", ["idle"]).map((i) => i.id)).toEqual(["idle", "blocked"]);
  });

  it("매칭이 없으면 빈 배열", () => {
    expect(filterPalette(ranked, "zzzz")).toEqual([]);
  });
});
