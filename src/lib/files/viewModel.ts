import type { FileEntry } from "$lib/ipc/files";

export interface FileGroup {
  dir: string;
  label: string;
  files: FileEntry[];
}

export function fileGroups(files: FileEntry[]): FileGroup[] {
  const grouped = new Map<string, FileEntry[]>();
  for (const file of files) grouped.set(file.dir, [...(grouped.get(file.dir) ?? []), file]);
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dir, entries]) => ({
      dir,
      label: dir || "루트",
      files: [...entries].sort((left, right) => left.name.localeCompare(right.name)),
    }));
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
