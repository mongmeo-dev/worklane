import { beforeEach, describe, expect, it, vi } from "vitest";

describe("terminalSettings store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("기본값은 monospace / 13", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    expect(terminalSettings.fontFamily).toBe("monospace");
    expect(terminalSettings.fontSize).toBe(13);
  });

  it("setFontSize는 8~32로 clamp한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontSize(100);
    expect(terminalSettings.fontSize).toBe(32);
    terminalSettings.setFontSize(2);
    expect(terminalSettings.fontSize).toBe(8);
  });

  it("setFontSize(NaN)은 이전값을 유지한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontSize(20);
    terminalSettings.setFontSize(NaN);
    expect(terminalSettings.fontSize).toBe(20);
  });

  it("빈 fontFamily는 monospace로 폴백한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontFamily("Menlo");
    terminalSettings.setFontFamily("");
    expect(terminalSettings.fontFamily).toBe("monospace");
  });

  it("init은 저장된 값을 복원한다", async () => {
    localStorage.setItem(
      "settings:terminal-font",
      JSON.stringify({ fontFamily: "JetBrains Mono", fontSize: 16 }),
    );
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.init();
    expect(terminalSettings.fontFamily).toBe("JetBrains Mono");
    expect(terminalSettings.fontSize).toBe(16);
  });

  it("init은 손상된 저장값을 기본값으로 폴백한다", async () => {
    localStorage.setItem("settings:terminal-font", "{{not json");
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.init();
    expect(terminalSettings.fontFamily).toBe("monospace");
    expect(terminalSettings.fontSize).toBe(13);
  });
});
