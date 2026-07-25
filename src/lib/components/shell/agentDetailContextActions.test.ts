import { describe, expect, it, vi } from "vitest";
import { absoluteFilePath, createFileTabContextActions } from "./agentDetailContextActions";

describe("file tab context actions", () => {
  it("orders copy and close actions without invoking either while opening the menu", () => {
    const copyPath = vi.fn();
    const onClose = vi.fn();
    const menu = createFileTabContextActions({
      worktreePath: "/Users/benny/project",
      path: "src/lib/file.ts",
      copyPath,
      onClose,
    });
    const actions = menu.items.filter((item) => item.type === "action");

    expect(actions.map((item) => item.id)).toEqual(["copy-path", "close-file"]);
    expect(copyPath).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    actions[0].onSelect();
    actions[1].onSelect();

    expect(copyPath).toHaveBeenCalledTimes(1);
    expect(copyPath).toHaveBeenCalledWith("/Users/benny/project/src/lib/file.ts");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the worktree platform separator when composing the clipboard path", () => {
    expect(absoluteFilePath("C:\\work\\project\\", "/src/lib/file.ts")).toBe(
      "C:\\work\\project\\src\\lib\\file.ts",
    );
  });
});
