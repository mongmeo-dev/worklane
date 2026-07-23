import { describe, expect, it } from "vitest";
import type { FileEntry } from "$lib/ipc/files";
import { fileGroups, fileTotals, sourceLines } from "./viewModel";

const files: FileEntry[] = [
  { path: "src/App.svelte", dir: "src", name: "App.svelte", change: "modified", add: 4, del: 2 },
  { path: "src/lib/a.ts", dir: "src/lib", name: "a.ts", change: "none", add: 0, del: 0 },
  { path: "README.md", dir: "", name: "README.md", change: "new", add: 10, del: 0 },
];

describe("파일 패널 표현 모델", () => {
  it("디렉터리별로 파일을 묶고 루트 그룹을 먼저 둔다", () => {
    const groups = fileGroups(files);
    expect(groups.map((group) => group.label)).toEqual(["루트", "src", "src/lib"]);
    expect(groups[0].files[0].name).toBe("README.md");
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
