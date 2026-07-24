import { beforeEach, describe, expect, it } from "vitest";
import { injectionDone, markInjected, resetInjectionCache } from "./promptInjection";

describe("promptInjection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetInjectionCache();
  });

  it("주입 전에는 done이 false", () => {
    expect(injectionDone("a1")).toBe(false);
  });

  it("mark 후에는 done이 true", () => {
    markInjected("a1");
    expect(injectionDone("a1")).toBe(true);
    expect(injectionDone("a2")).toBe(false);
  });

  it("localStorage에 영속되어 캐시를 비워도 유지된다", () => {
    markInjected("a1");
    resetInjectionCache();
    expect(injectionDone("a1")).toBe(true);
  });

  it("중복 mark는 안전하다", () => {
    markInjected("a1");
    markInjected("a1");
    expect(JSON.parse(localStorage.getItem("prompt:injected")!)).toEqual(["a1"]);
  });
});
