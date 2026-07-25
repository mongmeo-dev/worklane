import { beforeEach, describe, expect, it, vi } from "vitest";

describe("contextMenu store", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
  });

  it("replaces the singleton menu with a new generation and rejects a stale close", async () => {
    const { closeContextMenu, contextMenu, openContextMenu } = await import("./contextMenu.svelte");
    const firstOrigin = document.body.appendChild(document.createElement("button"));
    const secondOrigin = document.body.appendChild(document.createElement("button"));
    const first = openContextMenu({ ariaLabel: "Actions", items: [{ type: "action", id: "first", label: "First", onSelect: vi.fn() }], point: { x: 1, y: 2 }, origin: firstOrigin });
    const second = openContextMenu({ ariaLabel: "Actions", items: [{ type: "action", id: "second", label: "Second", onSelect: vi.fn() }], point: { x: 3, y: 4 }, origin: secondOrigin });

    closeContextMenu(first);

    expect(second).toBe(first + 1);
    expect(contextMenu.open).toBe(true);
    expect(contextMenu.snapshot()).toMatchObject({ generation: second, point: { x: 3, y: 4 }, origin: secondOrigin });
  });

  it("captures a model and point at open time rather than exposing later mutations", async () => {
    const { contextMenu, openContextMenu } = await import("./contextMenu.svelte");
    const action = { type: "action" as const, id: "copy", label: "Copy", onSelect: vi.fn() };
    const options = { ariaLabel: "Actions", items: [action], point: { x: 10, y: 20 } };
    openContextMenu(options);
    action.label = "Changed";
    options.point.x = 99;

    const snapshot = contextMenu.snapshot();
    expect(snapshot?.model.items[0]).toMatchObject({ label: "Copy" });
    expect(snapshot?.point).toEqual({ x: 10, y: 20 });
  });

  it("restores focus only for the current connected origin", async () => {
    const { closeContextMenu, openContextMenu } = await import("./contextMenu.svelte");
    const origin = document.body.appendChild(document.createElement("button"));
    const focus = vi.spyOn(origin, "focus");
    const generation = openContextMenu({ ariaLabel: "Actions", items: [], point: { x: 0, y: 0 }, origin, modality: "keyboard" });

    closeContextMenu(generation, "escape");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    const disconnected = document.createElement("button");
    const disconnectedFocus = vi.spyOn(disconnected, "focus");
    const disconnectedGeneration = openContextMenu({ ariaLabel: "Actions", items: [], point: { x: 0, y: 0 }, origin: disconnected, modality: "keyboard" });
    closeContextMenu(disconnectedGeneration, "escape");
    expect(disconnectedFocus).not.toHaveBeenCalled();
  });
  it("opens only the current global pending request and invalidates it on a direct open", async () => {
    const { contextMenu, openContextMenu } = await import("./contextMenu.svelte");
    const firstOrigin = document.body.appendChild(document.createElement("button"));
    const secondOrigin = document.body.appendChild(document.createElement("button"));
    const firstRequest = contextMenu.beginPendingRequest(firstOrigin);
    const secondRequest = contextMenu.beginPendingRequest(secondOrigin);

    expect(
      contextMenu.resolvePendingRequest(firstRequest, {
        ariaLabel: "First",
        items: [],
        point: { x: 1, y: 1 },
        origin: firstOrigin,
      }),
    ).toBeNull();

    const directGeneration = openContextMenu({
      ariaLabel: "Direct",
      items: [],
      point: { x: 2, y: 2 },
      origin: firstOrigin,
    });
    expect(
      contextMenu.resolvePendingRequest(secondRequest, {
        ariaLabel: "Second",
        items: [],
        point: { x: 3, y: 3 },
        origin: secondOrigin,
      }),
    ).toBeNull();
    expect(contextMenu.snapshot()).toMatchObject({
      generation: directGeneration,
      model: { ariaLabel: "Direct" },
    });
  });

  it("cancels pending requests on Escape, deactivation, or origin removal", async () => {
    const { contextMenu } = await import("./contextMenu.svelte");
    const origin = document.body.appendChild(document.createElement("button"));
    const escapeRequest = contextMenu.beginPendingRequest(origin);
    contextMenu.cancelPendingRequest();

    expect(
      contextMenu.resolvePendingRequest(escapeRequest, {
        ariaLabel: "Actions",
        items: [],
        point: { x: 0, y: 0 },
        origin,
      }),
    ).toBeNull();

    const deactivatedRequest = contextMenu.beginPendingRequest(origin);
    contextMenu.cancelPendingRequest();
    expect(
      contextMenu.resolvePendingRequest(deactivatedRequest, {
        ariaLabel: "Actions",
        items: [],
        point: { x: 0, y: 0 },
        origin,
      }),
    ).toBeNull();

    const removedRequest = contextMenu.beginPendingRequest(origin);
    origin.remove();
    expect(contextMenu.rejectPendingRequest(removedRequest, origin)).toBe(false);
    expect(contextMenu.pendingOrigin).toBeNull();
  });
});
