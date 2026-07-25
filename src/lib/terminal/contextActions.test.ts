import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import * as pty from "$lib/ipc/pty";
import { actionErrors } from "$lib/stores/actionErrors.svelte";
import { PooledTerminal } from "./pool";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    options: Record<string, unknown>;
    unicode = { activeVersion: "" };

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }

    loadAddon(): void {}
    open(): void {}
    write(_data: Uint8Array, callback?: () => void): void { callback?.(); }
    onData(): { dispose(): void } { return { dispose() {} }; }
    attachCustomKeyEventHandler(): void {}
    dispose(): void {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit(): void {} } }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    onContextLoss(): void {}
    dispose(): void {}
  },
}));
vi.mock("$lib/ipc/pty", () => ({
  createSession: vi.fn(),
  writeToPty: vi.fn(),
  resizePty: vi.fn(),
  closeSession: vi.fn(),
}));
vi.mock("$lib/terminal/HangulImeAddon", () => ({
  HangulImeAddon: class {
    isComposing(): boolean { return false; }
    handleKeyEvent(): boolean { return true; }
  },
}));
vi.mock("$lib/stores/terminalSettings.svelte", () => ({
  terminalSettings: { fontFamily: "monospace", fontSize: 14 },
}));
vi.mock("$lib/stores/sessions.svelte", () => ({
  sessionStatus: { noteOutput: vi.fn() },
}));
vi.mock("$lib/terminal/promptInjection", () => ({
  injectionDone: vi.fn(() => false),
  markInjected: vi.fn(),
}));
vi.mock("$lib/terminal/session-lifecycle", () => ({
  registerSessionDisposer: vi.fn(),
}));
vi.mock("$lib/stores/actionErrors.svelte", () => ({
  actionErrors: { report: vi.fn() },
}));
import { TerminalContextActions } from "./contextActions";

function terminal(selection = ""): Terminal {
  return {
    hasSelection: vi.fn(() => selection.length > 0),
    getSelection: vi.fn(() => selection),
    paste: vi.fn(),
    focus: vi.fn(),
    selectAll: vi.fn(),
  } as unknown as Terminal;
}

function clipboard(readText = vi.fn().mockResolvedValue(""), writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText, writeText } });
  return { readText, writeText };
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

describe("TerminalContextActions", () => {
  it("copies the exact selection captured when the menu opened", async () => {
    const mounted = terminal("copied text");
    const { writeText } = clipboard();
    const actions = new TerminalContextActions(mounted, () => mounted);

    await actions.copy();

    expect(actions.hasSelection).toBe(true);
    expect(writeText).toHaveBeenCalledWith("copied text");
  });

  it("pastes non-empty clipboard text only into its original current terminal", async () => {
    const mounted = terminal();
    const replacement = terminal();
    const { readText } = clipboard(vi.fn().mockResolvedValue("paste me"));
    const actions = new TerminalContextActions(mounted, () => mounted);
    await actions.paste();
    expect(readText).toHaveBeenCalledOnce();
    expect((mounted.paste as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("paste me");

    const stale = new TerminalContextActions(mounted, () => replacement);
    await stale.paste();
    expect(readText).toHaveBeenCalledOnce();
    expect((replacement.paste as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it("runs the user-input cancellation hook before awaiting clipboard text", async () => {
    let resolveClipboard!: (text: string) => void;
    const mounted = terminal();
    const cancelInjection = vi.fn();
    clipboard(vi.fn(() => new Promise<string>((resolve) => { resolveClipboard = resolve; })));
    const actions = new TerminalContextActions(mounted, () => mounted, cancelInjection);

    const paste = actions.paste();
    expect(cancelInjection).toHaveBeenCalledOnce();
    expect((mounted.paste as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    resolveClipboard("paste me");
    await paste;
    expect((mounted.paste as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("paste me");
  });

  it("selects all on the bound terminal and treats empty clipboard input as no-op", async () => {
    const mounted = terminal();
    clipboard(vi.fn().mockResolvedValue(""));
    const actions = new TerminalContextActions(mounted, () => mounted);
    actions.selectAll();
    await actions.paste();
    expect((mounted.focus as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((mounted.selectAll as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((mounted.paste as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("propagates clipboard rejection without targeting a stale adapter", async () => {
    const mounted = terminal("selection");
    const replacement = terminal();
    const readText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const writeText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    clipboard(readText, writeText);

    const current = new TerminalContextActions(mounted, () => mounted);
    await expect(current.copy()).rejects.toThrow("denied");
    await expect(current.paste()).rejects.toThrow("denied");

    const stale = new TerminalContextActions(mounted, () => replacement);
    await stale.copy();
    await stale.paste();
    expect(writeText).toHaveBeenCalledOnce();
    expect(readText).toHaveBeenCalledOnce();
    expect((replacement.paste as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("does not copy, focus, or select through a disposed terminal resolver", async () => {
    const mounted = terminal("selection");
    const { writeText } = clipboard();
    const actions = new TerminalContextActions(mounted, () => undefined);

    await actions.copy();
    actions.focus();
    actions.selectAll();

    expect(writeText).not.toHaveBeenCalled();
    expect((mounted.focus as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mounted.selectAll as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe("PooledTerminal", () => {
  afterEach(() => vi.useRealTimers());

  it("resets the seed prompt timer for every output chunk", async () => {
    vi.useFakeTimers();
    let onOutput!: (output: { bytes: number[] }) => void;
    (pty.createSession as any).mockImplementation(({ onOutput: listener }: { onOutput: typeof onOutput }) => {
      onOutput = listener;
    });
    (pty.writeToPty as any).mockResolvedValue(undefined);

    await PooledTerminal.create({ sessionId: "s1", cmd: "agent", cwd: "/tmp", initialPrompt: "seed" });
    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(800);
    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(899);
    expect(pty.writeToPty).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(pty.writeToPty).toHaveBeenCalledOnce();
  });
  it("claims the seed before a pending write so later output cannot retry it", async () => {
    vi.useFakeTimers();
    let onOutput!: (output: { bytes: number[] }) => void;
    let resolveWrite!: () => void;
    (pty.createSession as any).mockImplementation(({ onOutput: listener }: { onOutput: typeof onOutput }) => {
      onOutput = listener;
    });
    (pty.writeToPty as any).mockImplementation(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));

    await PooledTerminal.create({ sessionId: "s1", cmd: "agent", cwd: "/tmp", initialPrompt: "seed" });
    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(900);
    expect(pty.writeToPty).toHaveBeenCalledOnce();

    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(900);
    expect(pty.writeToPty).toHaveBeenCalledOnce();

    resolveWrite();
    await Promise.resolve();
    expect(actionErrors.report).not.toHaveBeenCalled();
  });
  it("reports a failed seed write without retrying it for the session", async () => {
    vi.useFakeTimers();
    let onOutput!: (output: { bytes: number[] }) => void;
    const writeError = new Error("seed failed");
    (pty.createSession as any).mockImplementation(({ onOutput: listener }: { onOutput: typeof onOutput }) => {
      onOutput = listener;
    });
    (pty.writeToPty as any).mockRejectedValue(writeError);

    await PooledTerminal.create({ sessionId: "s1", cmd: "agent", cwd: "/tmp", initialPrompt: "seed" });
    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(900);
    await Promise.resolve();
    onOutput({ bytes: [] });
    await vi.advanceTimersByTimeAsync(900);

    expect(pty.writeToPty).toHaveBeenCalledOnce();
    expect(actionErrors.report).toHaveBeenCalledWith(writeError);
  });

  it("awaits rollback close, reports its failure, and preserves the create failure", async () => {
    const createError = new Error("create failed");
    const closeError = new Error("close failed");
    let rejectClose!: (error: Error) => void;
    (pty.createSession as any).mockRejectedValue(createError);
    (pty.closeSession as any).mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectClose = reject; }));

    const creation = PooledTerminal.create({ sessionId: "s1", cmd: "agent", cwd: "/tmp" });
    await vi.waitFor(() => expect(pty.closeSession).toHaveBeenCalledWith("s1"));
    let settled = false;
    void creation.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    rejectClose(closeError);
    await expect(creation).rejects.toBe(createError);
    expect(actionErrors.report).toHaveBeenCalledWith(closeError);
  });
});
