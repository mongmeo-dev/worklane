import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Terminal from "./Terminal.svelte";

const acquire = vi.hoisted(() => vi.fn());
const activate = vi.hoisted(() => vi.fn());
const deactivate = vi.hoisted(() => vi.fn());

vi.mock("$lib/terminal/pool", () => ({
  terminalPool: { acquire },
}));
vi.mock("$lib/stores/terminalSettings.svelte", () => ({
  terminalSettings: { fontFamily: "monospace", fontSize: 13 },
}));
vi.mock("$lib/stores/agentDetection.svelte", () => ({
  agentDetection: { activate, deactivate },
}));
vi.mock("$lib/stores/actionErrors.svelte", () => ({ actionErrors: { report: vi.fn() } }));
vi.mock("$lib/stores/contextMenu.svelte", () => ({
  contextMenu: { snapshot: vi.fn(), isCurrent: vi.fn(), origin: null },
  closeContextMenu: vi.fn(),
}));
vi.mock("$lib/context-menu/trigger", () => ({
  createContextMenuTrigger: () => ({ oncontextmenu: vi.fn(), onkeydown: vi.fn() }),
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  acquire.mockReset();
  activate.mockReset();
  deactivate.mockReset();
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.unstubAllGlobals();
});

describe("Terminal", () => {
  it("풀 터미널을 화면에 다시 붙이면 입력 포커스를 이동한다", async () => {
    const container = document.createElement("div");
    const instance = {
      container,
      remount: vi.fn(),
      focus: vi.fn(),
      fitAndResize: vi.fn(),
      applyFont: vi.fn(),
      contextActions: vi.fn(),
    };
    acquire.mockResolvedValue(instance);

    component = mount(Terminal, {
      target: document.body,
      props: { sessionId: "session-1", cmd: "codex", cwd: "/tmp/repo" },
    });

    await vi.waitFor(() => expect(instance.focus).toHaveBeenCalledOnce());
    expect(instance.remount).toHaveBeenCalledBefore(instance.focus);
    expect(container.parentElement).not.toBeNull();
  });
});
