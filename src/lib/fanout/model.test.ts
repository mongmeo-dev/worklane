import { describe, expect, it } from "vitest";
import type { Agent, Project } from "$lib/types";
import { fanoutBranch, fanoutGroups, groupOf, slugify } from "./model";

function agent(id: string, groupId: string | null, over: Partial<Agent> = {}): Agent {
  return {
    id,
    projectId: "p1",
    title: "로그인 리팩터링",
    kind: "claude-code",
    command: "claude",
    branch: `fanout/x-${id}`,
    worktreePath: `/wt/${id}`,
    worktreeManaged: true,
    groupId,
    prompt: "로그인 로직을 리팩터링해줘",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("slugify", () => {
  it("공백을 하이픈으로, 특수문자를 제거한다", () => {
    expect(slugify("Fix Login Bug!")).toBe("fix-login-bug");
  });

  it("한글은 유지한다", () => {
    expect(slugify("로그인 리팩터링")).toBe("로그인-리팩터링");
  });

  it("연속 하이픈과 양끝 하이픈을 정리한다", () => {
    expect(slugify("  a__b  c  ")).toBe("a-b-c");
  });
});

describe("fanoutBranch", () => {
  it("slug와 kind로 브랜치를 만든다", () => {
    expect(fanoutBranch("Fix Login", "codex", "abcd1234-xxxx")).toBe("fanout/fix-login-codex");
  });

  it("slug가 비면 groupId 앞자리를 쓴다", () => {
    expect(fanoutBranch("!!!", "gemini", "abcd1234-xxxx")).toBe("fanout/abcd1234-gemini");
  });
});

describe("fanoutGroups", () => {
  it("groupId가 같은 에이전트끼리 묶는다", () => {
    const projects: Project[] = [
      {
        id: "p1",
        name: "웹",
        path: "/repo",
        defaultBranch: "main",
        createdAt: 0,
        updatedAt: 0,
        agents: [
          agent("a", "g1", { kind: "claude-code" }),
          agent("b", "g1", { kind: "codex" }),
          agent("c", null),
        ],
      },
    ];
    const groups = fanoutGroups(projects);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[0].projectName).toBe("웹");
    expect(groups[0].prompt).toContain("리팩터링");
  });

  it("groupId 없는 에이전트만 있으면 그룹이 없다", () => {
    const projects: Project[] = [
      { id: "p1", name: "웹", path: "/r", defaultBranch: "main", createdAt: 0, updatedAt: 0, agents: [agent("a", null)] },
    ];
    expect(fanoutGroups(projects)).toEqual([]);
  });
});

describe("groupOf", () => {
  it("groupId로 그룹을 찾는다", () => {
    const projects: Project[] = [
      {
        id: "p1",
        name: "웹",
        path: "/r",
        defaultBranch: "main",
        createdAt: 0,
        updatedAt: 0,
        agents: [agent("a", "g1"), agent("b", "g1")],
      },
    ];
    expect(groupOf(projects, "g1")?.members).toHaveLength(2);
    expect(groupOf(projects, "none")).toBeUndefined();
  });
});
