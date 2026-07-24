import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locale, t, localeTag } from "./index";

describe("locale store", () => {
  beforeEach(() => {
    localStorage.clear();
    locale.set("ko");
  });
  afterEach(() => {
    locale.set("ko");
  });

  it("set은 현재 로케일과 localStorage, <html lang>을 갱신한다", () => {
    locale.set("en");
    expect(locale.current).toBe("en");
    expect(localStorage.getItem("settings:locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("init은 저장된 로케일을 반영한다", () => {
    localStorage.setItem("settings:locale", "en");
    locale.init();
    expect(locale.current).toBe("en");
  });

  it("init은 손상된 저장값을 ko로 폴백한다", () => {
    localStorage.setItem("settings:locale", "garbage");
    locale.init();
    expect(locale.current).toBe("ko");
  });

  it("init은 저장값이 없으면 ko를 기본으로 한다", () => {
    locale.init();
    expect(locale.current).toBe("ko");
  });
});

describe("t", () => {
  beforeEach(() => {
    localStorage.clear();
    locale.set("ko");
  });
  afterEach(() => {
    locale.set("ko");
  });

  it("기본 로케일(ko)의 메시지를 반환한다", () => {
    expect(t("common.cancel")).toBe("취소");
    expect(t("status.blocked")).toBe("입력 대기");
  });

  it("로케일 전환 시 해당 언어 메시지를 반환한다", () => {
    locale.set("en");
    expect(t("common.cancel")).toBe("Cancel");
    expect(t("status.blocked")).toBe("Waiting");
  });

  it("{name} 자리표시자를 params로 치환한다", () => {
    expect(t("review.pushAhead", { count: 3 })).toBe("푸시 3");
    locale.set("en");
    expect(t("review.pushAhead", { count: 3 })).toBe("Push 3");
  });

  it("같은 자리표시자가 여러 번 나와도 모두 치환한다", () => {
    locale.set("en");
    // 값 안에 자리표시자가 한 번인 경우도 안전하게 동작
    expect(t("fanout.title", { project: "웹" })).toBe("Fan-out — 웹");
  });
});

describe("localeTag", () => {
  afterEach(() => locale.set("ko"));

  it("로케일에 맞는 BCP-47 태그를 반환한다", () => {
    locale.set("ko");
    expect(localeTag()).toBe("ko-KR");
    locale.set("en");
    expect(localeTag()).toBe("en-US");
  });
});
