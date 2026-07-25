import {
  snapshotContextMenuModel,
  type ContextMenuModel,
  type ContextMenuPoint,
  type ContextMenuSnapshot,
  type OpenContextMenuOptions,
} from "$lib/context-menu/model";

class ContextMenuStore {
  open = $state(false);
  generation = $state(0);
  model = $state<ContextMenuModel>({ ariaLabel: "", items: [] });
  point = $state<ContextMenuPoint>({ x: 0, y: 0 });
  origin = $state<HTMLElement | null>(null);

  openMenu(options: OpenContextMenuOptions): number {
    this.generation += 1;
    this.model = snapshotContextMenuModel(options);
    this.point = { ...options.point };
    this.origin = options.origin === undefined ? activeElement() : options.origin;
    this.open = true;
    return this.generation;
  }

  close(generation = this.generation, restoreFocus = true): void {
    if (generation !== this.generation || !this.open) return;

    const origin = this.origin;
    this.open = false;
    this.origin = null;

    if (restoreFocus && origin?.isConnected) {
      origin.focus({ preventScroll: true });
    }
  }

  snapshot(): ContextMenuSnapshot | null {
    if (!this.open) return null;
    return {
      generation: this.generation,
      model: snapshotContextMenuModel(this.model),
      point: { ...this.point },
      origin: this.origin,
    };
  }
}

function activeElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export const contextMenu = new ContextMenuStore();

export function openContextMenu(options: OpenContextMenuOptions): number {
  return contextMenu.openMenu(options);
}

export function closeContextMenu(generation?: number, restoreFocus = true): void {
  contextMenu.close(generation, restoreFocus);
}
