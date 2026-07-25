import { beforeEach, describe, expect, it, vi } from "vitest";

const openContextMenu = vi.hoisted(() => vi.fn());
vi.mock("$lib/stores/contextMenu.svelte", () => ({ openContextMenu }));

import { createContextMenuTrigger, keyboardPoint, openContextMenuFromKeyboard } from "./trigger";

const menu = { ariaLabel: "Actions", items: [] };

describe("context menu trigger", () => {
  beforeEach(() => {
    openContextMenu.mockReset();
    vi.spyOn(performance, "now").mockReturnValue(1_000);
  });

  it("opens from ContextMenu and Shift+F10 at the origin's lower-left corner", () => {
    const origin = document.createElement("button");
    document.body.append(origin);
    vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({ left: 12, bottom: 34 } as DOMRect);
    const trigger = createContextMenuTrigger(menu);

    const contextMenuEvent = new KeyboardEvent("keydown", { key: "ContextMenu", cancelable: true });
    origin.addEventListener("keydown", trigger.onkeydown);
    origin.dispatchEvent(contextMenuEvent);

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenLastCalledWith({ ...menu, point: { x: 12, y: 34 }, origin });

    vi.spyOn(performance, "now").mockReturnValue(1_301);
    const shiftF10 = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, cancelable: true });
    origin.dispatchEvent(shiftF10);
    expect(shiftF10.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenCalledTimes(2);
    origin.remove();
  });

  it("deduplicates pointer and keyboard opens from the same origin for 300ms", () => {
    const origin = document.createElement("div");
    document.body.append(origin);
    vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({ left: 5, bottom: 9 } as DOMRect);
    const trigger = createContextMenuTrigger(menu);
    origin.addEventListener("contextmenu", trigger.oncontextmenu);
    origin.addEventListener("keydown", trigger.onkeydown);

    const pointer = new MouseEvent("contextmenu", { clientX: 40, clientY: 50, cancelable: true });
    origin.dispatchEvent(pointer);
    vi.spyOn(performance, "now").mockReturnValue(1_299);
    const keyboard = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, cancelable: true });
    origin.dispatchEvent(keyboard);

    expect(pointer.defaultPrevented).toBe(true);
    expect(keyboard.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenCalledTimes(1);
    expect(openContextMenu).toHaveBeenCalledWith({ ...menu, point: { x: 40, y: 50 }, origin });
    origin.remove();
  });

  it("ignores unrelated keyboard shortcuts and derives keyboard points", () => {
    const origin = document.createElement("div");
    vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({ left: 7, bottom: 11 } as DOMRect);
    expect(keyboardPoint(origin)).toEqual({ x: 7, y: 11 });

    openContextMenuFromKeyboard(new KeyboardEvent("keydown", { key: "F10" }), menu);
    expect(openContextMenu).not.toHaveBeenCalled();
  });
});
