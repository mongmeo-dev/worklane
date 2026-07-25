import type { ContextMenuModel, ContextMenuPoint, OpenContextMenuOptions } from "./model";
import { actionErrors } from "$lib/stores/actionErrors.svelte";
import { contextMenu } from "$lib/stores/contextMenu.svelte";

const DEDUPE_MS = 300;
const lastKeyboardOpenAt = new WeakMap<HTMLElement, number>();

type MenuSource = ContextMenuModel | (() => ContextMenuModel | Promise<ContextMenuModel>);

export type ContextMenuTrigger = {
  oncontextmenu: (event: MouseEvent) => void;
  onkeydown: (event: KeyboardEvent) => void;
};

export function createContextMenuTrigger(menu: MenuSource): ContextMenuTrigger {
  return {
    oncontextmenu: (event) => openFromPointer(event, menu),
    onkeydown: (event) => openFromKeyboard(event, menu),
  };
}

export function openContextMenuFromPointer(event: MouseEvent, menu: MenuSource): void {
  openFromPointer(event, menu);
}

export function openContextMenuFromKeyboard(event: KeyboardEvent, menu: MenuSource): void {
  openFromKeyboard(event, menu);
}

function openFromPointer(event: MouseEvent, source: MenuSource): void {
  const origin = getOrigin(event.currentTarget);
  if (!origin) return;

  if (shouldConsumeKeyboardContextMenu(event, origin)) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  openFromSource(source, {
    point: { x: event.clientX, y: event.clientY },
    origin,
    modality: "pointer",
  });
}

function openFromKeyboard(event: KeyboardEvent, source: MenuSource): void {
  if (event.isComposing || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;

  event.preventDefault();

  const origin = getOrigin(event.currentTarget);
  if (!origin) return;

  lastKeyboardOpenAt.set(origin, performance.now());
  openFromSource(source, {
    point: keyboardPoint(origin),
    origin,
    modality: "keyboard",
  });
}

function openFromSource(
  source: MenuSource,
  snapshot: Pick<OpenContextMenuOptions, "point" | "origin" | "modality"> & { origin: HTMLElement },
): void {
  const request = contextMenu.beginPendingRequest(snapshot.origin);

  let menu: ContextMenuModel | Promise<ContextMenuModel>;
  try {
    menu = resolveMenu(source);
  } catch (reason) {
    if (contextMenu.rejectPendingRequest(request, snapshot.origin)) actionErrors.report(reason);
    return;
  }

  if (isPromiseLike(menu)) {
    void menu.then(
      (resolved) => {
        contextMenu.resolvePendingRequest(request, { ...resolved, ...snapshot });
      },
      (reason: unknown) => {
        if (contextMenu.rejectPendingRequest(request, snapshot.origin)) actionErrors.report(reason);
      },
    );
    return;
  }

  contextMenu.resolvePendingRequest(request, { ...menu, ...snapshot });
}

function resolveMenu(source: MenuSource): ContextMenuModel | Promise<ContextMenuModel> {
  return typeof source === "function" ? source() : source;
}
function isPromiseLike(menu: ContextMenuModel | Promise<ContextMenuModel>): menu is Promise<ContextMenuModel> {
  return typeof (menu as Promise<ContextMenuModel>).then === "function";
}

function getOrigin(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function shouldConsumeKeyboardContextMenu(event: MouseEvent, origin: HTMLElement): boolean {
  if (event.detail !== 0) return false;

  const openedAt = lastKeyboardOpenAt.get(origin);
  if (openedAt === undefined || performance.now() - openedAt >= DEDUPE_MS) return false;

  lastKeyboardOpenAt.delete(origin);
  return true;
}

export function keyboardPoint(origin: HTMLElement): ContextMenuPoint {
  const rect = origin.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}
