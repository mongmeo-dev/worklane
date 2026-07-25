import { beforeEach, describe, expect, it, vi } from "vitest";

const openContextMenu = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());
const contextMenu = vi.hoisted(() => {
  let requestEpoch = 0;
  let pendingOrigin: HTMLElement | null = null;

  return {
    beginPendingRequest(origin: HTMLElement) {
      requestEpoch += 1;
      pendingOrigin = origin;
      return requestEpoch;
    },
    resolvePendingRequest(
      request: number,
      options: typeof menu & {
        point: { x: number; y: number };
        origin: HTMLElement;
        modality: "pointer" | "keyboard";
      },
    ) {
      if (request !== requestEpoch || pendingOrigin !== options.origin || !options.origin.isConnected) return null;
      pendingOrigin = null;
      openContextMenu(options);
      return 1;
    },
    rejectPendingRequest(request: number, origin: HTMLElement) {
      if (request !== requestEpoch || pendingOrigin !== origin) return false;
      pendingOrigin = null;
      requestEpoch += 1;
      return origin.isConnected;
    },
    reset() {
      requestEpoch = 0;
      pendingOrigin = null;
    },
  };
});
vi.mock("$lib/stores/contextMenu.svelte", () => ({ contextMenu }));
vi.mock("$lib/stores/actionErrors.svelte", () => ({ actionErrors: { report } }));

import { createContextMenuTrigger, keyboardPoint, openContextMenuFromKeyboard, openContextMenuFromPointer } from "./trigger";

const menu = { ariaLabel: "Actions", items: [] };
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
  await Promise.resolve();
}


describe("context menu trigger", () => {
  beforeEach(() => {
    openContextMenu.mockReset();
    contextMenu.reset();
    report.mockReset();
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
    expect(openContextMenu).toHaveBeenLastCalledWith({ ...menu, point: { x: 12, y: 34 }, origin, modality: "keyboard" });

    vi.spyOn(performance, "now").mockReturnValue(1_301);
    const shiftF10 = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, cancelable: true });
    origin.dispatchEvent(shiftF10);
    expect(shiftF10.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenCalledTimes(2);
    origin.remove();
  });

  it("deduplicates a native context menu event that follows a keyboard open for 300ms", () => {
    const origin = document.createElement("div");
    document.body.append(origin);
    vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({ left: 5, bottom: 9 } as DOMRect);
    const trigger = createContextMenuTrigger(menu);
    origin.addEventListener("contextmenu", trigger.oncontextmenu);
    origin.addEventListener("keydown", trigger.onkeydown);

    const keyboard = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, cancelable: true });
    origin.dispatchEvent(keyboard);
    vi.spyOn(performance, "now").mockReturnValue(1_299);
    const nativeFollowup = new MouseEvent("contextmenu", { clientX: 40, clientY: 50, cancelable: true });
    origin.dispatchEvent(nativeFollowup);

    expect(keyboard.defaultPrevented).toBe(true);
    expect(nativeFollowup.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenCalledTimes(1);
    expect(openContextMenu).toHaveBeenCalledWith({ ...menu, point: { x: 5, y: 9 }, origin, modality: "keyboard" });
    origin.remove();
  });

  it("opens independently invoked pointer context menus", () => {
    const origin = document.createElement("div");
    document.body.append(origin);
    const trigger = createContextMenuTrigger(menu);
    origin.addEventListener("contextmenu", trigger.oncontextmenu);

    origin.dispatchEvent(new MouseEvent("contextmenu", { clientX: 40, clientY: 50, cancelable: true }));
    origin.dispatchEvent(new MouseEvent("contextmenu", { clientX: 60, clientY: 70, cancelable: true }));

    expect(openContextMenu).toHaveBeenCalledTimes(2);
    expect(openContextMenu).toHaveBeenLastCalledWith({ ...menu, point: { x: 60, y: 70 }, origin, modality: "pointer" });
    origin.remove();
  });

  it("ignores unrelated keyboard shortcuts and derives keyboard points", () => {
    const origin = document.createElement("div");
    vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({ left: 7, bottom: 11 } as DOMRect);
    expect(keyboardPoint(origin)).toEqual({ x: 7, y: 11 });

    openContextMenuFromKeyboard(new KeyboardEvent("keydown", { key: "F10" }), menu);
    expect(openContextMenu).not.toHaveBeenCalled();
  });
  it("opens only the newest asynchronous request across origins", async () => {
    const origin = document.createElement("div");
    const otherOrigin = document.createElement("div");
    document.body.append(origin, otherOrigin);
    const first = deferred<typeof menu>();
    const second = deferred<typeof menu>();
    const independent = deferred<typeof menu>();

    const firstEvent = new MouseEvent("contextmenu", { clientX: 1, clientY: 2, cancelable: true });
    const secondEvent = new MouseEvent("contextmenu", { clientX: 3, clientY: 4, cancelable: true });
    const otherEvent = new MouseEvent("contextmenu", { clientX: 5, clientY: 6, cancelable: true });
    let request = 0;
    origin.addEventListener("contextmenu", (event) => {
      openContextMenuFromPointer(event, () => (request++ === 0 ? first.promise : second.promise));
    });
    otherOrigin.addEventListener("contextmenu", (event) => {
      openContextMenuFromPointer(event, () => independent.promise);
    });
    origin.dispatchEvent(firstEvent);
    origin.dispatchEvent(secondEvent);
    otherOrigin.dispatchEvent(otherEvent);

    independent.resolve(menu);
    second.resolve(menu);
    first.resolve(menu);
    await settle();

    expect(firstEvent.defaultPrevented).toBe(true);
    expect(secondEvent.defaultPrevented).toBe(true);
    expect(openContextMenu).toHaveBeenCalledTimes(1);
    expect(openContextMenu).toHaveBeenCalledWith({ ...menu, point: { x: 5, y: 6 }, origin: otherOrigin, modality: "pointer" });
    origin.remove();
    otherOrigin.remove();
  });

  it("reports only the active asynchronous menu resolution failure", async () => {
    const origin = document.body.appendChild(document.createElement("div"));
    const otherOrigin = document.body.appendChild(document.createElement("div"));
    const staleFailure = new Error("stale preflight failed");
    const activeFailure = new Error("active preflight failed");
    const stale = deferred<typeof menu>();
    const active = deferred<typeof menu>();

    origin.addEventListener("contextmenu", (event) => {
      openContextMenuFromPointer(event, () => stale.promise);
    });
    otherOrigin.addEventListener("contextmenu", (event) => {
      openContextMenuFromPointer(event, () => active.promise);
    });
    origin.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));
    otherOrigin.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));

    stale.reject(staleFailure);
    active.reject(activeFailure);
    await settle();

    expect(openContextMenu).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(activeFailure);
    origin.remove();
    otherOrigin.remove();
  });
});
