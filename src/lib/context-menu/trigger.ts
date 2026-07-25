import type { ContextMenuModel, ContextMenuPoint } from "./model";
import { openContextMenu } from "$lib/stores/contextMenu.svelte";

const DEDUPE_MS = 300;
const lastOpenAt = new WeakMap<HTMLElement, number>();

type MenuSource = ContextMenuModel | (() => ContextMenuModel);

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
  event.preventDefault();

  const origin = getOrigin(event.currentTarget);
  if (!origin || !canOpen(origin)) return;

  openContextMenu({
    ...resolveMenu(source),
    point: { x: event.clientX, y: event.clientY },
    origin,
  });
}

function openFromKeyboard(event: KeyboardEvent, source: MenuSource): void {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;

  event.preventDefault();

  const origin = getOrigin(event.currentTarget);
  if (!origin || !canOpen(origin)) return;

  openContextMenu({
    ...resolveMenu(source),
    point: keyboardPoint(origin),
    origin,
  });
}

function resolveMenu(source: MenuSource): ContextMenuModel {
  return typeof source === "function" ? source() : source;
}

function getOrigin(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function canOpen(origin: HTMLElement): boolean {
  const now = performance.now();
  const previous = lastOpenAt.get(origin) ?? -Infinity;
  if (now - previous < DEDUPE_MS) return false;
  lastOpenAt.set(origin, now);
  return true;
}

export function keyboardPoint(origin: HTMLElement): ContextMenuPoint {
  const rect = origin.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}
