import { mount, tick, unmount } from "svelte";
// @ts-expect-error Svelte does not publish types for this test-only reactive props helper.
import { proxy } from "svelte/internal/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "$lib/types";
import { projectStore } from "$lib/stores/projects.svelte";
import RenameAgentDialog from "./RenameAgentDialog.svelte";

vi.mock("$lib/stores/projects.svelte", () => ({
  projectStore: { patchAgentTitle: vi.fn() },
}));

const agent: Agent = {
  id: "agent-1",
  projectId: "project-1",
  title: "Original title",
  kind: "codex",
  command: "codex",
  branch: "feature/test",
  worktreePath: "/tmp/worktree",
  worktreeManaged: true,
  createdAt: 0,
  updatedAt: 0,
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

function submitTitle(title: string) {
  const input = document.querySelector<HTMLInputElement>("#rename-agent-title");
  const form = input?.closest("form");
  if (!input || !form) throw new Error("Rename dialog was not rendered");

  input.value = title;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("RenameAgentDialog", () => {
  let target: HTMLDivElement | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    target?.remove();
    cleanup = undefined;
    target = undefined;
    vi.mocked(projectStore.patchAgentTitle).mockReset();
  });

  it("does not let a stale successful rename close a reopened dialog", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    vi.mocked(projectStore.patchAgentTitle)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const props = proxy({ open: true, agent: { ...agent } });
    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(RenameAgentDialog, { target, props });
    cleanup = () => unmount(instance);
    await settle();

    submitTitle("First title");
    await settle();
    props.open = false;
    await settle();
    props.open = true;
    await settle();
    submitTitle("Second title");
    await settle();

    first.resolve();
    await settle();

    expect(props.open).toBe(true);
    expect(document.querySelector("#rename-agent-error")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);

    second.resolve();
    await settle();
    expect(props.open).toBe(false);
  });

  it("does not let a stale failed rename show an error in a reopened dialog", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    vi.mocked(projectStore.patchAgentTitle)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const props = proxy({ open: true, agent: { ...agent } });
    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(RenameAgentDialog, { target, props });
    cleanup = () => unmount(instance);
    await settle();

    submitTitle("First title");
    await settle();
    props.open = false;
    await settle();
    props.open = true;
    await settle();
    submitTitle("Second title");
    await settle();

    first.reject(new Error("backend reason must not be displayed"));
    await settle();

    expect(props.open).toBe(true);
    expect(document.querySelector("#rename-agent-error")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);

    second.resolve();
    await settle();
    expect(props.open).toBe(false);
  });
});
