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
  it("resets the current title and focuses and selects it when opened", async () => {
    const props = proxy({ open: false, agent: { ...agent, title: "Updated title" } });
    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(RenameAgentDialog, { target, props });
    cleanup = () => unmount(instance);
    await settle();

    props.open = true;
    await settle();

    const input = document.querySelector<HTMLInputElement>("#rename-agent-title");
    expect(input?.value).toBe("Updated title");
    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe("Updated title".length);
  });

  it("closes without saving when cancelled or dismissed with Escape", async () => {
    const props = proxy({ open: true, agent: { ...agent } });
    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(RenameAgentDialog, { target, props });
    cleanup = () => unmount(instance);
    await settle();

    const cancel = document.querySelector<HTMLButtonElement>("[data-slot=dialog-footer] button[type=button]");
    expect(cancel).toBeDefined();
    cancel?.click();
    await settle();
    expect(props.open).toBe(false);
    expect(projectStore.patchAgentTitle).not.toHaveBeenCalled();

    props.open = true;
    await settle();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await settle();

    expect(props.open).toBe(false);
    expect(projectStore.patchAgentTitle).not.toHaveBeenCalled();
  });

  it("trims the title and submits only once when Enter submits repeatedly", async () => {
    const rename = deferred<void>();
    vi.mocked(projectStore.patchAgentTitle).mockReturnValue(rename.promise);

    const props = proxy({ open: true, agent: { ...agent } });
    target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(RenameAgentDialog, { target, props });
    cleanup = () => unmount(instance);
    await settle();

    submitTitle("  Renamed title  ");
    submitTitle("  Renamed title  ");
    await settle();

    expect(projectStore.patchAgentTitle).toHaveBeenCalledTimes(1);
    expect(projectStore.patchAgentTitle).toHaveBeenCalledWith(agent.id, "Renamed title");

    rename.resolve();
    await settle();
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
