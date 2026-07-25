import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "$lib/types";
import type { FileEntry } from "$lib/ipc/files";
import { listWorktreeFiles } from "$lib/ipc/files";
import { shell } from "$lib/stores/shell.svelte";
import { t } from "$lib/i18n";
import FilePanel from "./FilePanel.svelte";

vi.mock("$lib/ipc/files", () => ({
  listWorktreeFiles: vi.fn(),
}));
const preflightExternalPath = vi.hoisted(() => vi.fn());
const contextMenuMock = vi.hoisted(() => {
  let currentRequest = 0;
  const openContextMenu = vi.fn();
  return {
    openContextMenu,
    contextMenu: {
      beginPendingRequest: vi.fn(() => ++currentRequest),
      resolvePendingRequest: vi.fn((request: number, options: unknown) => {
        if (request !== currentRequest) return false;
        openContextMenu(options);
        return true;
      }),
      rejectPendingRequest: vi.fn((request: number) => request === currentRequest),
    },
  };
});
const { openContextMenu } = contextMenuMock;
vi.mock("$lib/ipc/external", () => ({
  preflightExternalPath,
  openDirectory: vi.fn(),
  revealEntry: vi.fn(),
}));
vi.mock("$lib/stores/contextMenu.svelte", () => contextMenuMock);
vi.mock("$lib/stores/actionErrors.svelte", () => ({ actionErrors: { report: vi.fn() } }));

const agent: Agent = {
  id: "agent-1",
  projectId: "project-1",
  title: "Agent",
  kind: "codex",
  command: "codex",
  branch: "feature/test",
  worktreePath: "/tmp/worktree",
  worktreeManaged: true,
  createdAt: 0,
  updatedAt: 0,
};

const newerFile: FileEntry = {
  path: "newer.ts",
  dir: "",
  name: "newer.ts",
  change: "modified",
  add: 1,
  del: 0,
};
const treeFiles: FileEntry[] = [
  {
    path: "src/newer.ts",
    dir: "src",
    name: "newer.ts",
    change: "modified",
    add: 1,
    del: 0,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await Promise.resolve();
  await tick();
}

describe("FilePanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  let target: HTMLDivElement | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    target?.remove();
    cleanup = undefined;
    target = undefined;
    vi.mocked(listWorktreeFiles).mockReset();
    vi.mocked(preflightExternalPath).mockReset();
    openContextMenu.mockReset();
    vi.unstubAllGlobals();
  });

  it("commits only the latest controlled load request", async () => {
    const first = deferred<FileEntry[]>();
    const second = deferred<FileEntry[]>();
    vi.mocked(listWorktreeFiles)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(FilePanel, { target, props: { agent } });
    cleanup = () => unmount(instance);
    await settle();
    expect(listWorktreeFiles).toHaveBeenCalledTimes(1);

    shell.bumpWorktree();
    await tick();
    expect(listWorktreeFiles).toHaveBeenCalledTimes(2);

    first.resolve([]);
    await settle();
    expect(target.querySelector('[role="status"]')).not.toBeNull();

    second.resolve([newerFile]);
    await settle();
    expect(target.textContent).toContain("newer.ts");
  });

  it("does not replace a newer result with a stale load error", async () => {
    const first = deferred<FileEntry[]>();
    const second = deferred<FileEntry[]>();
    vi.mocked(listWorktreeFiles)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(FilePanel, { target, props: { agent } });
    cleanup = () => unmount(instance);
    await settle();
    expect(listWorktreeFiles).toHaveBeenCalledTimes(1);

    shell.bumpWorktree();
    await tick();
    expect(listWorktreeFiles).toHaveBeenCalledTimes(2);
    second.resolve([newerFile]);
    await settle();

    first.reject(new Error("stale failure"));
    await settle();
    expect(target.textContent).toContain("newer.ts");
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });
  it("preflights file and folder menus without opening files or toggling folders", async () => {
    vi.mocked(listWorktreeFiles).mockResolvedValue(treeFiles);
    vi.mocked(preflightExternalPath)
      .mockResolvedValueOnce({ disposition: "nearestParent", nearestParent: "src" })
      .mockResolvedValueOnce({ disposition: "exact" });

    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(FilePanel, { target, props: { agent } });
    cleanup = () => unmount(instance);
    await settle();

    const buttons = Array.from(target.querySelectorAll("button"));
    const folder = buttons.find((button) => button.textContent?.includes("src"));
    expect(folder).toBeDefined();
    folder!.click();
    await settle();
    const file = Array.from(target.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("newer.ts"),
    );
    expect(file).toBeDefined();

    const pointer = new MouseEvent("contextmenu", { clientX: 20, clientY: 30, cancelable: true, bubbles: true });
    file!.dispatchEvent(pointer);
    await settle();

    expect(pointer.defaultPrevented).toBe(true);
    expect(preflightExternalPath).toHaveBeenCalledWith(agent.worktreePath, "src/newer.ts");
    expect(shell.openFilePath).toBeNull();
    expect(openContextMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ariaLabel: t("contextMenu.file"),
        point: { x: 20, y: 30 },
        origin: file,
        modality: "pointer",
        items: expect.arrayContaining([
          expect.objectContaining({ id: "reveal", label: t("contextMenu.openNearestParent", { path: "src" }) }),
        ]),
      }),
    );

    vi.spyOn(folder!, "getBoundingClientRect").mockReturnValue({ left: 4, bottom: 8 } as DOMRect);
    const keyboard = new KeyboardEvent("keydown", { key: "ContextMenu", cancelable: true, bubbles: true });
    folder!.dispatchEvent(keyboard);
    await settle();

    expect(keyboard.defaultPrevented).toBe(true);
    expect(preflightExternalPath).toHaveBeenLastCalledWith(agent.worktreePath, "src");
    expect(folder?.getAttribute("aria-expanded")).toBe("true");
    expect(openContextMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ariaLabel: t("contextMenu.folder"),
        point: { x: 4, y: 8 },
        origin: folder,
        modality: "keyboard",
        items: expect.arrayContaining([
          expect.objectContaining({ id: "reveal", label: t("contextMenu.openFileManager") }),
        ]),
      }),
    );
  });
  it("does not open a menu from a stale file preflight response", async () => {
    const first = deferred<{ disposition: "exact" }>();
    vi.mocked(listWorktreeFiles).mockResolvedValue([newerFile]);
    vi.mocked(preflightExternalPath)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(Promise.resolve({ disposition: "exact" }));

    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(FilePanel, { target, props: { agent } });
    cleanup = () => unmount(instance);
    await settle();

    const file = Array.from(target.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("newer.ts"),
    );
    expect(file).toBeDefined();

    file!.dispatchEvent(new MouseEvent("contextmenu", { clientX: 1, clientY: 2, cancelable: true, bubbles: true }));
    file!.dispatchEvent(new MouseEvent("contextmenu", { clientX: 3, clientY: 4, cancelable: true, bubbles: true }));
    await settle();
    first.resolve({ disposition: "exact" });
    await settle();

    expect(openContextMenu).toHaveBeenCalledTimes(1);
    expect(openContextMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({ point: { x: 3, y: 4 }, origin: file, modality: "pointer" }),
    );
  });
});
