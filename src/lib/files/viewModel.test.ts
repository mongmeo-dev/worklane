import { describe, expect, it } from "vitest";
import type { FileEntry } from "$lib/ipc/files";
import { fileTotals, fileTree, sourceLines } from "./viewModel";

const files: FileEntry[] = [
  { path: "src/App.svelte", dir: "src", name: "App.svelte", change: "modified", add: 4, del: 2 },
  { path: "src/lib/a.ts", dir: "src/lib", name: "a.ts", change: "none", add: 0, del: 0 },
  { path: "README.md", dir: "", name: "README.md", change: "new", add: 10, del: 0 },
];

describe("파일 패널 표현 모델", () => {
  it("루트 파일과 하위 폴더를 IDE식 중첩 트리로 만든다", () => {
    const tree = fileTree(files);
    // 최상위: 폴더(src)가 먼저, 그다음 루트 파일(README.md)
    expect(tree.map((node) => node.name)).toEqual(["src", "README.md"]);
    expect(tree[0].kind).toBe("dir");
    expect(tree[1].kind).toBe("file");

    const src = tree[0];
    if (src.kind !== "dir") throw new Error("src는 폴더여야 한다");
    // 폴더(lib)가 파일(App.svelte)보다 먼저 오고, lib 안에 a.ts가 중첩된다
    expect(src.children.map((node) => node.name)).toEqual(["lib", "App.svelte"]);

    const lib = src.children[0];
    if (lib.kind !== "dir") throw new Error("lib은 폴더여야 한다");
    expect(lib.children.map((node) => node.name)).toEqual(["a.ts"]);
  });

  it("폴더에 하위 전체의 변경 파일 수·증감·파일 수를 합산한다", () => {
    const src = fileTree(files)[0];
    if (src.kind !== "dir") throw new Error("src는 폴더여야 한다");
    expect(src.fileCount).toBe(2);
    expect(src.add).toBe(4);
    expect(src.del).toBe(2);
    expect(src.changed).toBe(1);
  });

  it("변경 파일 수와 증감을 합산한다", () => {
    expect(fileTotals(files)).toEqual({ changed: 2, add: 14, del: 2 });
  });

  it("원문을 1부터 시작하는 줄번호로 변환한다", () => {
    expect(sourceLines("a\nb\n")).toEqual([
      { no: 1, text: "a" },
      { no: 2, text: "b" },
      { no: 3, text: "" },
    ]);
  });
});
