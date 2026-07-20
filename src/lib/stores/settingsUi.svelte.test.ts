import { beforeEach, describe, expect, it, vi } from "vitest";

describe("settingsUi store", () => {
  beforeEach(() => vi.resetModules());

  it("open/close가 isOpen을 토글한다", async () => {
    const { settingsUi } = await import("./settingsUi.svelte");
    expect(settingsUi.isOpen).toBe(false);
    settingsUi.open();
    expect(settingsUi.isOpen).toBe(true);
    settingsUi.close();
    expect(settingsUi.isOpen).toBe(false);
  });

  it("기본 탭은 screen이다", async () => {
    const { settingsUi } = await import("./settingsUi.svelte");
    expect(settingsUi.activeTab).toBe("screen");
  });
});
