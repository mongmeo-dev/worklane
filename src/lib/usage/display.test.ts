import { describe, expect, it } from "vitest";
import { clampPercent, gaugeTone, resourceLabel } from "./display";

describe("사용량 표시", () => {
  it("게이지 퍼센트를 0~100으로 제한한다", () => {
    expect(clampPercent(-2)).toBe(0);
    expect(clampPercent(42.4)).toBe(42.4);
    expect(clampPercent(120)).toBe(100);
  });

  it("75%와 90%에서 경고 단계를 올린다", () => {
    expect(gaugeTone(74)).toBe("normal");
    expect(gaugeTone(75)).toBe("warning");
    expect(gaugeTone(90)).toBe("danger");
  });

  it("RAM 사용량을 한 자리 소수로 표시한다", () => {
    expect(resourceLabel(22.68, 32)).toBe("22.7/32GB");
  });
});
