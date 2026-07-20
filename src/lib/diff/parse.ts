/**
 * unified diff(`git diff` 출력) 텍스트를 UI 렌더링에 적합한 구조로 파싱한다.
 *
 * 구조: DiffFile[] -> DiffHunk[] -> DiffLine[]
 */

export type DiffLineKind = "context" | "add" | "delete";

export interface DiffLine {
  kind: DiffLineKind;
  /** 라인 내용 (접두 +/-/space 제거됨) */
  content: string;
  /** 원본(old) 파일 기준 라인 번호. add 라인은 null. */
  oldLineNo: number | null;
  /** 신규(new) 파일 기준 라인 번호. delete 라인은 null. */
  newLineNo: number | null;
}

export interface DiffHunk {
  /** @@ 헤더 원문 (예: "@@ -1,4 +1,6 @@ fn main()") */
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffFile {
  /** 변경 후 경로 (삭제된 파일은 oldPath 사용) */
  path: string;
  oldPath: string;
  newPath: string;
  /** 신규 생성/삭제/이름변경 여부 */
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  /** 바이너리 파일이라 라인 diff가 없는 경우 */
  isBinary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

/** "@@ -oldStart,oldLen +newStart,newLen @@ context" 헤더를 파싱한다. */
function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!m) return null;
  return { oldStart: Number(m[1]), newStart: Number(m[2]) };
}

/** "diff --git a/foo b/bar" 라인에서 경로를 뽑는다. */
function parseGitHeaderPaths(line: string): { oldPath: string; newPath: string } {
  // 경로에 공백이 없다는 전제(일반적). a/ b/ 접두 제거.
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (m) return { oldPath: m[1], newPath: m[2] };
  return { oldPath: "", newPath: "" };
}

/**
 * diff 전체 텍스트를 DiffFile[] 로 파싱한다.
 * 파일 경계는 "diff --git" 라인으로 나눈다.
 */
export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const lines = raw.split("\n");
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  // hunk 내에서 진행 중인 라인 번호 카운터
  let oldNo = 0;
  let newNo = 0;

  const pushFile = (f: DiffFile | null) => {
    if (f) files.push(f);
  };

  for (const line of lines) {
    // 새 파일 블록 시작
    if (line.startsWith("diff --git ")) {
      pushFile(current);
      const { oldPath, newPath } = parseGitHeaderPaths(line);
      current = {
        path: newPath || oldPath,
        oldPath,
        newPath,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      continue;
    }

    if (!current) continue;

    // 파일 메타데이터 라인들
    if (line.startsWith("new file mode")) {
      current.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.isDeleted = true;
      continue;
    }
    if (line.startsWith("rename from") || line.startsWith("rename to")) {
      current.isRenamed = true;
      continue;
    }
    if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
      current.isBinary = true;
      continue;
    }
    // --- a/... / +++ b/... 헤더에서 경로 보정
    if (line.startsWith("--- ")) {
      const p = line.slice(4);
      // --no-index로 나온 untracked 신규 파일은 "new file mode" 없이 "--- /dev/null"만 온다.
      if (p === "/dev/null") current.isNew = true;
      else current.oldPath = p.replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = line.slice(4);
      if (p === "/dev/null") {
        current.isDeleted = true;
      } else {
        current.newPath = p.replace(/^b\//, "");
        current.path = current.newPath;
      }
      continue;
    }
    // index 라인 등은 무시
    if (line.startsWith("index ") || line.startsWith("similarity index")) {
      continue;
    }

    // hunk 헤더
    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line);
      if (parsed) {
        currentHunk = {
          header: line,
          oldStart: parsed.oldStart,
          newStart: parsed.newStart,
          lines: [],
        };
        current.hunks.push(currentHunk);
        oldNo = parsed.oldStart;
        newNo = parsed.newStart;
      }
      continue;
    }

    // hunk 본문 라인
    if (currentHunk) {
      // "\ No newline at end of file" 는 표시에서 제외
      if (line.startsWith("\\")) continue;

      const parsed = parseContentLine(line, oldNo, newNo);
      if (parsed) {
        currentHunk.lines.push(parsed.line);
        oldNo = parsed.nextOld;
        newNo = parsed.nextNew;
        if (parsed.line.kind === "add") current.additions += 1;
        else if (parsed.line.kind === "delete") current.deletions += 1;
      }
    }
  }

  pushFile(current);
  return files;
}

/**
 * hunk 본문의 한 라인을 파싱한다.
 *
 * 입력:
 *   - line: diff 본문 한 줄. 첫 글자가 '+'(추가), '-'(삭제), ' '(문맥) 중 하나.
 *   - oldNo: 현재 old(원본) 파일 라인 카운터
 *   - newNo: 현재 new(신규) 파일 라인 카운터
 *
 * 반환:
 *   - line: { kind, content, oldLineNo, newLineNo } DiffLine
 *   - nextOld / nextNew: 다음 라인에서 쓸 갱신된 카운터
 *   - 매칭되지 않는 라인이면 null
 *
 * 규칙:
 *   - '+' 라인: kind="add",    oldLineNo=null,  newLineNo=newNo,  new 카운터만 +1
 *   - '-' 라인: kind="delete", oldLineNo=oldNo, newLineNo=null,   old 카운터만 +1
 *   - ' ' 라인 또는 완전 빈 줄: kind="context", 둘 다 +1
 */
function parseContentLine(
  line: string,
  oldNo: number,
  newNo: number
): { line: DiffLine; nextOld: number; nextNew: number } | null {
  const marker = line[0];
  const content = line.slice(1);

  if (marker === "+") {
    return {
      line: { kind: "add", content, oldLineNo: null, newLineNo: newNo },
      nextOld: oldNo,
      nextNew: newNo + 1,
    };
  }
  if (marker === "-") {
    return {
      line: { kind: "delete", content, oldLineNo: oldNo, newLineNo: null },
      nextOld: oldNo + 1,
      nextNew: newNo,
    };
  }
  // 공백 접두 문맥 라인, 그리고 파일 끝 등에서 오는 완전한 빈 줄("")도
  // 문맥의 빈 줄로 취급해 라인 번호를 정합하게 유지한다.
  if (marker === " " || line === "") {
    return {
      line: { kind: "context", content, oldLineNo: oldNo, newLineNo: newNo },
      nextOld: oldNo + 1,
      nextNew: newNo + 1,
    };
  }

  return null;
}
