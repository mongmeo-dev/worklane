import { describe, expect, it } from "vitest";
import { en, ko } from "./messages";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("메시지 카탈로그", () => {
  it("ko와 en의 키 집합이 완전히 동일하다", () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });

  it("각 키의 {자리표시자} 집합이 두 로케일에서 동일하다", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(en[key]), `placeholder mismatch for ${key}`).toEqual(placeholders(ko[key]));
    }
  });

  it("빈 문자열 값이 없다", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].length, `empty en value for ${key}`).toBeGreaterThan(0);
      expect(ko[key].length, `empty ko value for ${key}`).toBeGreaterThan(0);
    }
  });
});
