import { describe, expect, it } from "vitest";
import { clampThreshold, DEFAULT_BUDGET_THRESHOLD, overBudget } from "./budget";

describe("clampThreshold", () => {
  it("범위를 벗어난 값을 1~100으로 자른다", () => {
    expect(clampThreshold(0)).toBe(1);
    expect(clampThreshold(150)).toBe(100);
    expect(clampThreshold(80.4)).toBe(80);
  });

  it("유효하지 않은 값은 기본값으로 폴백한다", () => {
    expect(clampThreshold(Number.NaN)).toBe(DEFAULT_BUDGET_THRESHOLD);
  });
});

describe("overBudget", () => {
  it("임계값 이상이면 초과", () => {
    expect(overBudget(85, 80)).toBe(true);
    expect(overBudget(80, 80)).toBe(true);
  });

  it("임계값 미만이면 미초과", () => {
    expect(overBudget(79, 80)).toBe(false);
  });

  it("미연동(null)은 미초과", () => {
    expect(overBudget(null, 80)).toBe(false);
  });
});
