import { describe, it, expect } from "vitest";
import { isKorean, computePreeditUpdate, DEL } from "./ime-core";

describe("isKorean", () => {
  it("호환 자모와 완성 음절을 한글로 판별한다", () => {
    expect(isKorean("ㄱ")).toBe(true);
    expect(isKorean("ㅏ")).toBe(true);
    expect(isKorean("가")).toBe(true);
    expect(isKorean("힣")).toBe(true);
  });

  it("영문/숫자/기호는 한글이 아니다", () => {
    expect(isKorean("a")).toBe(false);
    expect(isKorean("1")).toBe(false);
    expect(isKorean("@")).toBe(false);
    expect(isKorean(" ")).toBe(false);
  });
});

describe("computePreeditUpdate", () => {
  it("처음 조합 시작: 지울 것 없이 새 글자만 보낸다", () => {
    expect(computePreeditUpdate("", "ㄱ")).toEqual({ send: "ㄱ", preedit: "ㄱ" });
  });

  it("조합 갱신: 이전 1글자를 DEL로 지우고 새 글자를 보낸다", () => {
    // "ㄱ" → "가": 이전 1글자 삭제 후 "가"
    expect(computePreeditUpdate("ㄱ", "가")).toEqual({
      send: DEL + "가",
      preedit: "가",
    });
  });

  it("변화 없으면 아무것도 안 보낸다", () => {
    expect(computePreeditUpdate("가", "가")).toEqual({ send: "", preedit: "가" });
  });

  it("조합 취소(빈 문자열)면 이전 글자만 지운다", () => {
    expect(computePreeditUpdate("가", "")).toEqual({ send: DEL, preedit: "" });
  });

  it("이전 preedit이 여러 글자면 그 수만큼 DEL", () => {
    expect(computePreeditUpdate("가나", "가다")).toEqual({
      send: DEL + DEL + "가다",
      preedit: "가다",
    });
  });
});
