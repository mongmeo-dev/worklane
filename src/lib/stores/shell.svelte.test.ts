import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ShellStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("에이전트를 선택하면 열린 파일을 닫고 터미널로 이동한다", async () => {
    const { createShellStore } = await import("./shell.svelte");
    const store = createShellStore();
    store.openFile("src/App.svelte");

    store.selectAgent("agent-1");

    expect(store.selectedAgentId).toBe("agent-1");
    expect(store.openFilePath).toBeNull();
    expect(store.showEditor).toBe(false);
  });

  it("상태 필터를 고르면 오버뷰로 이동한다", async () => {
    const { createShellStore } = await import("./shell.svelte");
    const store = createShellStore();
    store.selectAgent("agent-1");

    store.setFilter("blocked");

    expect(store.selectedAgentId).toBeNull();
    expect(store.overviewFilter).toBe("blocked");
  });

  it("터미널 탭 전환은 열린 파일 탭을 유지한다", async () => {
    const { createShellStore } = await import("./shell.svelte");
    const store = createShellStore();
    store.openFile("src/App.svelte");

    store.selectTerminal("agent-2");

    expect(store.selectedAgentId).toBe("agent-2");
    expect(store.openFilePath).toBe("src/App.svelte");
    expect(store.showEditor).toBe(false);
  });

  it("패널 열림 상태를 localStorage에 저장한다", async () => {
    const { createShellStore } = await import("./shell.svelte");
    const store = createShellStore();

    store.toggleLeftPanel();
    store.toggleRightPanel();

    expect(store.leftPanelOpen).toBe(false);
    expect(store.rightPanelOpen).toBe(false);
    expect(localStorage.getItem("shell:left-open")).toBe("false");
    expect(localStorage.getItem("shell:right-open")).toBe("false");
  });
});
