import { beforeEach, describe, expect, it, vi } from "vitest";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.resetModules();
  });

  it("setMode('dark')는 <html>에 dark 클래스를 추가하고 저장한다", async () => {
    const { theme } = await import("./theme.svelte");
    theme.setMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("settings:theme-mode")).toBe("dark");
    expect(theme.mode).toBe("dark");
  });

  it("setMode('light')는 dark 클래스를 제거한다", async () => {
    const { theme } = await import("./theme.svelte");
    theme.setMode("dark");
    theme.setMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("settings:theme-mode")).toBe("light");
  });

  it("system 모드는 matchMedia 결과를 따른다 (matches=true → dark)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { theme } = await import("./theme.svelte");
    theme.setMode("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("init은 손상된 저장값을 system으로 폴백한다", async () => {
    localStorage.setItem("settings:theme-mode", "garbage");
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { theme } = await import("./theme.svelte");
    theme.init();
    expect(theme.mode).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("init은 멱등이다 (system 모드에서 반복 호출 안전)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { theme } = await import("./theme.svelte");
    theme.setMode("system");
    theme.init();
    theme.init(); // 중복 구독/크래시 없이 안전해야 함
    expect(theme.mode).toBe("system");
  });
});
