import { describe, expect, it, vi } from "vitest";
import { snapshotContextMenuModel, type ContextMenuModel } from "./model";

describe("snapshotContextMenuModel", () => {
  it("preserves separators while snapshotting nested menu entries independently", () => {
    const select = vi.fn();
    const model: ContextMenuModel = {
      ariaLabel: "File actions",
      items: [
        { type: "separator", id: "before" },
        {
          type: "submenu",
          id: "more",
          label: "More",
          items: [{ type: "action", id: "rename", label: "Rename", onSelect: select }],
        },
        { type: "separator" },
      ],
    };

    const snapshot = snapshotContextMenuModel(model);
    const submenu = snapshot.items[1];

    expect(snapshot).toEqual(model);
    expect(snapshot).not.toBe(model);
    expect(snapshot.items).not.toBe(model.items);
    expect(snapshot.items[0]).toEqual({ type: "separator", id: "before" });
    expect(snapshot.items[2]).toEqual({ type: "separator" });
    expect(submenu).toMatchObject({ type: "submenu", id: "more" });

    if (submenu.type !== "submenu") throw new Error("expected submenu");
    const originalSubmenu = model.items[1];
    if (originalSubmenu.type !== "submenu") throw new Error("expected submenu");
    expect(submenu).not.toBe(originalSubmenu);
    expect(submenu.items).not.toBe(originalSubmenu.items);
    expect(submenu.items[0]).not.toBe(originalSubmenu.items[0]);
    expect((submenu.items[0] as { onSelect: () => void }).onSelect).toBe(select);
  });

  it("does not let later source mutations alter a captured snapshot", () => {
    const model: ContextMenuModel = {
      ariaLabel: "More actions",
      items: [{ type: "submenu", id: "more", label: "More", items: [{ type: "action", id: "copy", label: "Copy", onSelect: vi.fn() }] }],
    };
    const snapshot = snapshotContextMenuModel(model);
    const sourceSubmenu = model.items[0];
    if (sourceSubmenu.type !== "submenu") throw new Error("expected submenu");

    sourceSubmenu.label = "Changed";
    sourceSubmenu.items.push({ type: "separator" });

    const capturedSubmenu = snapshot.items[0];
    if (capturedSubmenu.type !== "submenu") throw new Error("expected submenu");
    expect(capturedSubmenu.label).toBe("More");
    expect(capturedSubmenu.items).toHaveLength(1);
  });
});
