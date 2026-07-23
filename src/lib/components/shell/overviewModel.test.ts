import { describe, expect, it } from "vitest";
import type { Agent } from "$lib/types";
import { filterAgents, plainTerminalTail, tileAction } from "./overviewModel";

const agents: Agent[] = [
  { id: "run", projectId: "p", title: "실행", kind: "codex", command: "codex", branch: "main", worktreePath: "/run", worktreeManaged: true, createdAt: 1, updatedAt: 1, status: "running" },
  { id: "block", projectId: "p", title: "대기", kind: "claude-code", command: "claude", branch: "main", worktreePath: "/block", worktreeManaged: true, createdAt: 1, updatedAt: 1, status: "blocked" },
  { id: "done", projectId: "p", title: "완료", kind: "gemini", command: "gemini", branch: "main", worktreePath: "/done", worktreeManaged: true, createdAt: 1, updatedAt: 1, status: "done" },
];

describe("오버뷰 표현 모델", () => {
  it("선택한 상태만 남긴다", () => {
    expect(filterAgents(agents, "blocked").map((agent) => agent.id)).toEqual(["block"]);
    expect(filterAgents(agents, "all")).toHaveLength(3);
  });

  it("상태에 맞는 주요 액션을 반환한다", () => {
    expect(tileAction("blocked")).toBe("응답하기 →");
    expect(tileAction("done")).toBe("변경 검토 →");
    expect(tileAction("idle")).toBe("재개 →");
  });

  it("ANSI를 제거하고 마지막 줄만 유지한다", () => {
    const text = "첫 줄\n\u001b[32m둘째 줄\u001b[0m\n셋째 줄\n넷째 줄";
    expect(plainTerminalTail(text, 2)).toBe("셋째 줄\n넷째 줄");
  });
});
