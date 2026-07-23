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

  it("에이전트 탭으로 전환할 수 있다", async () => {
    const { settingsUi } = await import("./settingsUi.svelte");
    settingsUi.setTab("agents");
    expect(settingsUi.activeTab).toBe("agents");
  });
});
