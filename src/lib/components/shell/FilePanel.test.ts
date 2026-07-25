import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "$lib/types";
import type { FileEntry } from "$lib/ipc/files";
import { listWorktreeFiles } from "$lib/ipc/files";
import { shell } from "$lib/stores/shell.svelte";
import FilePanel from "./FilePanel.svelte";

vi.mock("$lib/ipc/files", () => ({
  listWorktreeFiles: vi.fn(),
}));

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
});
