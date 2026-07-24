import type { FileChange, FileEntry } from "$lib/ipc/files";

export interface FileTreeFile {
  kind: "file";
  path: string;
  name: string;
  change: FileChange;
  add: number;
  del: number;
}

export interface FileTreeDir {
  kind: "dir";
  path: string;
  name: string;
  children: FileTreeNode[];
  changed: number;
  add: number;
  del: number;
  fileCount: number;
}

export type FileTreeNode = FileTreeDir | FileTreeFile;

function makeDir(path: string, name: string): FileTreeDir {
  return { kind: "dir", path, name, children: [], changed: 0, add: 0, del: 0, fileCount: 0 };
}

/** 폴더가 먼저, 그다음 파일. 같은 종류는 이름순으로 정렬한다. */
function sortNodes(node: FileTreeDir): void {
  node.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "dir" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) if (child.kind === "dir") sortNodes(child);
}

/** 각 폴더에 하위 전체의 변경 파일 수·증감·파일 수를 합산해 저장한다. */
function aggregate(node: FileTreeDir): void {
  let changed = 0;
  let add = 0;
  let del = 0;
  let fileCount = 0;
  for (const child of node.children) {
    if (child.kind === "file") {
      fileCount += 1;
      add += child.add;
      del += child.del;
      if (child.change !== "none") changed += 1;
    } else {
      aggregate(child);
      fileCount += child.fileCount;
      add += child.add;
      del += child.del;
      changed += child.changed;
    }
  }
  node.changed = changed;
  node.add = add;
  node.del = del;
  node.fileCount = fileCount;
}

/**
 * 평면 파일 목록을 IDE식 중첩 트리로 변환한다.
 * 루트 파일은 최상위에 파일 노드로, 하위 디렉터리는 부모 폴더 안에 중첩된다.
 */
export function fileTree(files: FileEntry[]): FileTreeNode[] {
  const root = makeDir("", "");
  const dirCache = new Map<string, FileTreeDir>([["", root]]);

  function ensureDir(dir: string): FileTreeDir {
    const cached = dirCache.get(dir);
    if (cached) return cached;
    const segments = dir.split("/");
    const name = segments[segments.length - 1];
    const parent = ensureDir(segments.slice(0, -1).join("/"));
    const node = makeDir(dir, name);
    parent.children.push(node);
    dirCache.set(dir, node);
    return node;
  }

  for (const file of files) {
    ensureDir(file.dir).children.push({
      kind: "file",
      path: file.path,
      name: file.name,
      change: file.change,
      add: file.add,
      del: file.del,
    });
  }

  sortNodes(root);
  aggregate(root);
  return root.children;
}

export function fileTotals(files: FileEntry[]): { changed: number; add: number; del: number } {
  return files.reduce(
    (total, file) => ({
      changed: total.changed + (file.change === "none" ? 0 : 1),
      add: total.add + file.add,
      del: total.del + file.del,
    }),
    { changed: 0, add: 0, del: 0 },
  );
}

export function sourceLines(content: string): { no: number; text: string }[] {
  return content.split("\n").map((text, index) => ({ no: index + 1, text }));
}
