import { describe, expect, it } from "vitest";
import { recommendWinner, type RankInput } from "./ranking";

function item(over: Partial<RankInput> & { agentId: string }): RankInput {
  return { changed: 0, success: true, durationMs: 0, ...over };
}

describe("recommendWinner", () => {
  it("통과한 멤버가 없으면 null", () => {
    expect(recommendWinner([item({ agentId: "a", success: false })])).toBeNull();
  });

  it("통과 멤버 중 변경이 가장 적은 것을 추천한다", () => {
    const winner = recommendWinner([
      item({ agentId: "a", changed: 10 }),
      item({ agentId: "b", changed: 3 }),
      item({ agentId: "c", changed: 7 }),
    ]);
    expect(winner).toBe("b");
  });

  it("변경이 같으면 더 빠른 검증을 추천한다", () => {
    const winner = recommendWinner([
      item({ agentId: "a", changed: 5, durationMs: 900 }),
      item({ agentId: "b", changed: 5, durationMs: 300 }),
    ]);
    expect(winner).toBe("b");
  });

  it("실패한 멤버는 후보에서 제외한다", () => {
    const winner = recommendWinner([
      item({ agentId: "a", changed: 1, success: false }),
      item({ agentId: "b", changed: 9, success: true }),
    ]);
    expect(winner).toBe("b");
  });
});
