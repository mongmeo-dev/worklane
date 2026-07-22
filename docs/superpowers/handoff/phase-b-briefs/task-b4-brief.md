## Task B4: 파일 트리 / 파일 읽기 / 파일별 diff

**Files:**
- Modify: `src-tauri/src/git/mod.rs` (파일 목록/diff 추가)
- Create: `src-tauri/src/files/mod.rs` (파일 읽기 + 경로 안전)
- Modify: `lib.rs`, `commands.rs`
- Create: `src/lib/ipc/files.ts`

**Interfaces:** 마스터 계약의 `FileEntry`/`FileContent`/`DiffLine` + 3개 함수.

- [ ] **Step 1: 파일 목록 로직 테스트 (git/mod.rs)**

worktree의 변경 상태를 `git status --porcelain`으로 파싱하는 순수 함수 `parse_status_porcelain(out) -> Vec<(path, FileChange)>`:

```rust
#[cfg(test)]
mod file_tests {
    use super::*;
    #[test]
    fn porcelain_수정_신규_삭제_파싱() {
        let out = " M src/a.rs\n?? src/new.rs\n D src/gone.rs\nA  staged.rs\n";
        let v = parse_status_porcelain(out);
        assert!(v.contains(&("src/a.rs".to_string(), FileChange::Modified)));
        assert!(v.contains(&("src/new.rs".to_string(), FileChange::New)));
        assert!(v.contains(&("src/gone.rs".to_string(), FileChange::Deleted)));
        assert!(v.contains(&("staged.rs".to_string(), FileChange::Modified)));
    }
}
```

`git/mod.rs`에 추가:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChange { None, Modified, New, Deleted }

pub fn parse_status_porcelain(out: &str) -> Vec<(String, FileChange)> {
    let mut v = Vec::new();
    for line in out.lines() {
        if line.len() < 4 { continue; }
        let code = &line[..2];
        let path = line[3..].to_string();
        let change = if code == "??" { FileChange::New }
            else if code.contains('D') { FileChange::Deleted }
            else { FileChange::Modified };
        v.push((path, change));
    }
    v
}
```

Run: `cd src-tauri && cargo test git::file_tests` → PASS (구현 후).

- [ ] **Step 2: FileEntry 목록 명령**

`git/mod.rs`에 `list_files(worktree) -> Vec<FileEntry>`: `git ls-files`(추적 파일) ∪ status(변경) 합쳐 각 파일에 change/add/del 부여. add/del은 `git diff --numstat HEAD` 파싱.

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String, pub dir: String, pub name: String,
    pub change: FileChange, pub add: u32, pub del: u32,
}

pub fn list_files(worktree: &str) -> Result<Vec<FileEntry>, String> {
    let tracked = run_git(worktree, &["ls-files"])?;
    let status = run_git(worktree, &["status", "--porcelain"])?;
    let numstat = run_git(worktree, &["diff", "--numstat", "HEAD"])?;

    let changes: std::collections::HashMap<String, FileChange> =
        parse_status_porcelain(&status).into_iter().collect();
    let stats = parse_numstat(&numstat); // HashMap<path,(add,del)>

    let mut set: std::collections::BTreeSet<String> = tracked.lines().map(|s| s.to_string()).collect();
    for (p, _) in &changes { set.insert(p.clone()); }

    Ok(set.into_iter().map(|path| {
        let (dir, name) = split_path(&path);
        let change = *changes.get(&path).unwrap_or(&FileChange::None);
        let (add, del) = stats.get(&path).copied().unwrap_or((0, 0));
        FileEntry { path, dir, name, change, add, del }
    }).collect())
}

fn parse_numstat(out: &str) -> std::collections::HashMap<String, (u32, u32)> {
    let mut m = std::collections::HashMap::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add = parts[0].parse().unwrap_or(0);
            let del = parts[1].parse().unwrap_or(0);
            m.insert(parts[2].to_string(), (add, del));
        }
    }
    m
}

fn split_path(path: &str) -> (String, String) {
    match path.rfind('/') {
        Some(i) => (path[..i].to_string(), path[i+1..].to_string()),
        None => ("/".to_string(), path.to_string()),
    }
}
```

`parse_numstat`/`split_path`도 각각 간단 단위테스트 추가(`"5\t3\tsrc/a.rs"` → `("src/a.rs",(5,3))`).

- [ ] **Step 3: 파일 읽기(경로 안전) — files/mod.rs**

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent { pub content: String, pub is_binary: bool }

/// worktree 밖 접근을 막고 파일 내용을 읽는다. 바이너리는 content 빈 문자열.
pub fn read_file(worktree: &str, rel: &str) -> Result<FileContent, String> {
    let base = std::fs::canonicalize(worktree).map_err(|e| e.to_string())?;
    let target = std::fs::canonicalize(base.join(rel)).map_err(|e| e.to_string())?;
    if !target.starts_with(&base) {
        return Err("worktree 밖 경로 접근 거부".into());
    }
    let bytes = std::fs::read(&target).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Ok(FileContent { content: String::new(), is_binary: true });
    }
    Ok(FileContent { content: String::from_utf8_lossy(&bytes).into_owned(), is_binary: false })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn worktree_밖_경로는_거부() {
        let dir = std::env::temp_dir();
        // ../ 탈출 시도는 canonicalize 후 base 밖이 되어 거부되어야 함
        let err = read_file(dir.to_str().unwrap(), "../../etc/passwd");
        assert!(err.is_err());
    }
}
```

- [ ] **Step 4: 파일별 diff 라인**

`git/mod.rs`에 `file_diff_lines(worktree, rel) -> Vec<DiffLine>`: `git diff HEAD -- <rel>`의 unified diff를 파싱해 `@@` 헤더에서 라인번호 추적. 신규 파일은 `--no-index /dev/null` 사용(기존 diff_working_tree 패턴 참고).

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String, // "add"|"del"|"ctx"
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

/// unified diff 한 파일 분량을 DiffLine 배열로 파싱(순수 함수).
pub fn parse_unified_diff(diff: &str) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    let (mut old_no, mut new_no) = (0u32, 0u32);
    for l in diff.lines() {
        if l.starts_with("@@") {
            // @@ -a,b +c,d @@
            if let Some((o, n)) = parse_hunk_header(l) { old_no = o; new_no = n; }
        } else if l.starts_with("+++") || l.starts_with("---") || l.starts_with("diff ") || l.starts_with("index ") || l.starts_with("new file") || l.starts_with("deleted file") {
            continue;
        } else if let Some(rest) = l.strip_prefix('+') {
            lines.push(DiffLine { kind: "add".into(), old_no: None, new_no: Some(new_no), text: rest.to_string() });
            new_no += 1;
        } else if let Some(rest) = l.strip_prefix('-') {
            lines.push(DiffLine { kind: "del".into(), old_no: Some(old_no), new_no: None, text: rest.to_string() });
            old_no += 1;
        } else if let Some(rest) = l.strip_prefix(' ') {
            lines.push(DiffLine { kind: "ctx".into(), old_no: Some(old_no), new_no: Some(new_no), text: rest.to_string() });
            old_no += 1; new_no += 1;
        }
    }
    lines
}

fn parse_hunk_header(l: &str) -> Option<(u32, u32)> {
    // @@ -12,7 +12,8 @@ ...
    let body = l.trim_start_matches('@').trim();
    let mut old = None; let mut new = None;
    for tok in body.split_whitespace() {
        if let Some(s) = tok.strip_prefix('-') { old = s.split(',').next().and_then(|x| x.parse().ok()); }
        if let Some(s) = tok.strip_prefix('+') { new = s.split(',').next().and_then(|x| x.parse().ok()); }
    }
    Some((old?, new?))
}

#[cfg(test)]
mod diff_tests {
    use super::*;
    #[test]
    fn 헌크_추가삭제_라인번호_추적() {
        let d = "@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n";
        let v = parse_unified_diff(d);
        assert_eq!(v[0].kind, "ctx");
        assert_eq!(v[0].old_no, Some(1));
        assert_eq!(v[1].kind, "del");
        assert_eq!(v[1].old_no, Some(2));
        assert_eq!(v[2].kind, "add");
        assert_eq!(v[2].new_no, Some(2));
    }
}
```

그리고 실제 실행 래퍼:

```rust
pub fn file_diff_lines(worktree: &str, rel: &str) -> Result<Vec<DiffLine>, String> {
    let diff = run_git(worktree, &["diff", "HEAD", "--no-color", "--no-ext-diff", "--", rel])?;
    if diff.trim().is_empty() {
        // 신규(untracked) 파일 대비
        let d = run_git_allow_fail(worktree, &["diff", "--no-color", "--no-index", "--", "/dev/null", rel]).unwrap_or_default();
        return Ok(parse_unified_diff(&d));
    }
    Ok(parse_unified_diff(&diff))
}
```

- [ ] **Step 5: 명령 등록 + IPC 래퍼**

`lib.rs`: `mod files;`, invoke_handler에 `commands::list_worktree_files, commands::read_worktree_file, commands::git_file_diff,`.

`commands.rs`:

```rust
#[tauri::command]
pub async fn list_worktree_files(worktree_path: String) -> Result<Vec<crate::git::FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::list_files(&worktree_path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_worktree_file(worktree_path: String, rel_path: String) -> Result<crate::files::FileContent, String> {
    tauri::async_runtime::spawn_blocking(move || crate::files::read_file(&worktree_path, &rel_path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn git_file_diff(worktree_path: String, rel_path: String) -> Result<Vec<crate::git::DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::file_diff_lines(&worktree_path, &rel_path))
        .await.map_err(|e| e.to_string())?
}
```

`src/lib/ipc/files.ts` (마스터 계약대로):

```ts
import { invoke } from "@tauri-apps/api/core";

export type FileChange = "none" | "modified" | "new" | "deleted";
export interface FileEntry { path: string; dir: string; name: string; change: FileChange; add: number; del: number; }
export interface FileContent { content: string; isBinary: boolean; }
export type DiffLineKind = "add" | "del" | "ctx";
export interface DiffLine { kind: DiffLineKind; oldNo: number | null; newNo: number | null; text: string; }

export function listWorktreeFiles(worktreePath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_worktree_files", { worktreePath });
}
export function readWorktreeFile(worktreePath: string, relPath: string): Promise<FileContent> {
  return invoke<FileContent>("read_worktree_file", { worktreePath, relPath });
}
export function gitFileDiff(worktreePath: string, relPath: string): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("git_file_diff", { worktreePath, relPath });
}
```

- [ ] **Step 6: 테스트/커밋**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS.

```bash
git add src-tauri/src/git src-tauri/src/files src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/files.ts
git commit -m "feat: worktree 파일 목록·읽기·파일별 diff 명령 추가"
```

---

