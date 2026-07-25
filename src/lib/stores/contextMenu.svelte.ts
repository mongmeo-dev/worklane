import {
  snapshotContextMenuModel,
  type ContextMenuCloseReason,
  type ContextMenuModality,
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
  modality = $state<ContextMenuModality>("pointer");
  pendingOrigin = $state<HTMLElement | null>(null);
  private requestEpoch = 0;

  beginPendingRequest(origin: HTMLElement): number {
    this.invalidatePendingRequest();
    this.pendingOrigin = origin;
    return this.requestEpoch;
  }

  resolvePendingRequest(request: number, options: OpenContextMenuOptions & { origin: HTMLElement }): number | null {
    if (!this.isCurrentPendingRequest(request, options.origin)) {
      if (this.pendingOrigin === options.origin && request === this.requestEpoch) this.invalidatePendingRequest();
      return null;
    }

    this.pendingOrigin = null;
    return this.openMenu(options);
  }

  rejectPendingRequest(request: number, origin: HTMLElement): boolean {
    if (this.pendingOrigin !== origin || request !== this.requestEpoch) return false;

    const connected = origin.isConnected;
    this.invalidatePendingRequest();
    return connected;
  }

  cancelPendingRequest(): void {
    this.invalidatePendingRequest();
  }

  private isCurrentPendingRequest(request: number, origin: HTMLElement): boolean {
    return this.pendingOrigin === origin && request === this.requestEpoch && origin.isConnected;
  }

  private invalidatePendingRequest(): void {
    this.requestEpoch += 1;
    this.pendingOrigin = null;
  }

  openMenu(options: OpenContextMenuOptions): number {
    this.invalidatePendingRequest();
    if (this.open) this.close(this.generation, "replacement");

    this.generation += 1;
    this.model = snapshotContextMenuModel(options);
    this.point = { ...options.point };
    this.origin = options.origin === undefined ? activeElement() : options.origin;
    this.modality = options.modality ?? "pointer";
    this.open = true;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return this.open && generation === this.generation;
  }

  close(generation = this.generation, reason: ContextMenuCloseReason = "outside"): void {
    if (!this.isCurrent(generation)) return;

    const origin = this.origin;
    const restoreFocus = reason === "escape" && this.modality === "keyboard";
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
      modality: this.modality,
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

export function closeContextMenu(generation?: number, reason?: ContextMenuCloseReason): void {
  contextMenu.close(generation, reason);
}
