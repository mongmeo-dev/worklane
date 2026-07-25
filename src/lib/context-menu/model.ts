export type ContextMenuAction = {
  type: "action";
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  shortcut?: string;
};

export type ContextMenuSeparator = {
  type: "separator";
  id?: string;
};

export type ContextMenuSubmenu = {
  type: "submenu";
  id: string;
  label: string;
  items: ContextMenuEntry[];
  disabled?: boolean;
};

export type ContextMenuEntry = ContextMenuAction | ContextMenuSeparator | ContextMenuSubmenu;

export type ContextMenuModel = {
  items: ContextMenuEntry[];
  ariaLabel: string;
};

export type ContextMenuPoint = {
  x: number;
  y: number;
};

export type OpenContextMenuOptions = ContextMenuModel & {
  point: ContextMenuPoint;
  origin?: HTMLElement | null;
};

export type ContextMenuSnapshot = Readonly<{
  generation: number;
  model: ContextMenuModel;
  point: ContextMenuPoint;
  origin: HTMLElement | null;
}>;

export function snapshotContextMenuModel(model: ContextMenuModel): ContextMenuModel {
  return {
    ariaLabel: model.ariaLabel,
    items: model.items.map(snapshotEntry),
  };
}

function snapshotEntry(entry: ContextMenuEntry): ContextMenuEntry {
  if (entry.type !== "submenu") return { ...entry };
  return { ...entry, items: entry.items.map(snapshotEntry) };
}
