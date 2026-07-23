use std::process::Command;

/// worktree에 uncommitted 변경이 있어 remove가 거부됐음을 나타내는 판별 문자열.
pub const ERR_WORKTREE_DIRTY: &str = "WORKTREE_DIRTY";

/// 경로가 이미 유효한 git worktree인지 확인한다.
pub fn is_existing_worktree(path: &str) -> bool {
    std::path::Path::new(path).join(".git").exists()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingWorkspace {
    pub path: String,
    pub branch: String,
}

pub fn inspect_existing_workspace(path: &str) -> Result<ExistingWorkspace, String> {
    let root = run_git(path, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "선택한 경로는 Git 저장소가 아닙니다.".to_string())?;
    let root = root.trim();
    if root.is_empty() {
        return Err("선택한 경로는 Git 저장소가 아닙니다.".into());
    }
    let canonical =
        std::fs::canonicalize(root).map_err(|error| format!("프로젝트 경로 확인 실패: {error}"))?;
    let branch = run_git(root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).map_err(|_| {
        "현재 checkout이 브랜치를 가리키지 않습니다. 브랜치를 checkout한 뒤 다시 시도해 주세요."
            .to_string()
    })?;
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("현재 checkout 브랜치를 확인할 수 없습니다.".into());
    }
    Ok(ExistingWorkspace {
        path: canonical.to_string_lossy().into_owned(),
        branch: branch.to_string(),
    })
}

/// 새 브랜치로 worktree를 생성한다. branch가 이미 있으면 -b 없이 붙인다.
/// 생성된 worktree의 절대경로를 반환한다.
pub fn create_worktree(
    repo_path: &str,
    branch: &str,
    start_point: &str,
    worktree_path: &str,
) -> Result<String, String> {
    // 브랜치 존재 여부 확인 (rev-parse는 없으면 non-zero)
    let exists = run_git_allow_fail(
        repo_path,
        &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")],
    )
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);

    if exists {
        run_git(repo_path, &["worktree", "add", worktree_path, branch])?;
    } else {
        run_git(repo_path, &["worktree", "add", "-b", branch, worktree_path, start_point])?;
    }
    // 절대경로 정규화
    let abs = std::fs::canonicalize(worktree_path)
        .map_err(|e| format!("worktree 경로 확인 실패: {e}"))?;
    Ok(abs.to_string_lossy().into_owned())
}

/// worktree를 제거한다. force=false에서 uncommitted 변경으로 실패하면 ERR_WORKTREE_DIRTY를 반환한다.
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(worktree_path);
    match run_git(repo_path, &args) {
        Ok(_) => Ok(()),
        Err(e) => {
            if !force && (e.contains("contains modified") || e.contains("is dirty") || e.contains("use --force")) {
                Err(ERR_WORKTREE_DIRTY.to_string())
            } else {
                Err(e)
            }
        }
    }
}

/// worktree에 uncommitted 변경(추적/미추적 포함)이 있는지 확인한다.
pub fn worktree_has_changes(worktree_path: &str) -> Result<bool, String> {
    let out = run_git(worktree_path, &["status", "--porcelain"])?;
    Ok(!out.trim().is_empty())
}

/// working tree의 uncommitted 변경(staged + unstaged) 전체를 unified diff 문자열로 반환한다.
/// `git diff HEAD`에 대응한다. 추적되지 않은(untracked) 새 파일도 포함하기 위해
/// `--` 이후 pathspec 없이 `-p`로 실행하고, untracked는 별도로 합친다.
pub fn diff_working_tree(cwd: &str) -> Result<String, String> {
    // 저장소 여부 확인 (명확한 에러 메시지 제공)
    let toplevel = run_git(cwd, &["rev-parse", "--show-toplevel"])?;
    let repo_root = toplevel.trim();
    if repo_root.is_empty() {
        return Err("git 저장소가 아닙니다.".to_string());
    }

    // 추적 중인 파일의 uncommitted 변경 전체.
    let tracked = run_git(
        repo_root,
        &["diff", "HEAD", "--no-color", "--no-ext-diff"],
    )?;

    // 추적되지 않은 새 파일도 diff에 포함해 검토 누락을 방지한다.
    let untracked_files = run_git(
        repo_root,
        &["ls-files", "-z", "--others", "--exclude-standard"],
    )?;

    let mut out = tracked;
    for path in untracked_files.split_terminator('\0').filter(|path| !path.is_empty()) {
        // /dev/null 대비 새 파일 diff. --no-index는 변경이 있으면 exit code 1을 반환한다.
        let diff = run_git_diff(
            repo_root,
            &["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", path],
        )?;
        out.push_str(&diff);
    }

    Ok(out)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChange {
    None,
    Modified,
    New,
    Deleted,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub dir: String,
    pub name: String,
    pub change: FileChange,
    pub add: u32,
    pub del: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

/// git status --porcelain 출력을 파일 경로와 변경 상태로 변환한다.
pub fn parse_status_porcelain(output: &str) -> Vec<(String, FileChange)> {
    if output.contains('\0') {
        let mut records = output.split_terminator('\0');
        let mut changes = Vec::new();
        while let Some(record) = records.next() {
            let Some(code) = record.get(..2) else {
                continue;
            };
            let Some(path) = record.get(3..) else {
                continue;
            };
            let change = if code == "??" {
                FileChange::New
            } else if code.contains('D') {
                FileChange::Deleted
            } else {
                FileChange::Modified
            };
            changes.push((path.to_string(), change));
            if code.contains('R') || code.contains('C') {
                records.next();
            }
        }
        return changes;
    }

    output
        .lines()
        .filter_map(|line| {
            let code = line.get(..2)?;
            let raw_path = line.get(3..)?;
            let path = raw_path
                .rsplit_once(" -> ")
                .map(|(_, renamed)| renamed)
                .unwrap_or(raw_path)
                .to_string();
            let change = if code == "??" {
                FileChange::New
            } else if code.contains('D') {
                FileChange::Deleted
            } else {
                FileChange::Modified
            };
            Some((path, change))
        })
        .collect()
}

/// 추적 파일과 변경 파일을 합쳐 worktree 파일 목록을 만든다.
pub fn list_files(worktree: &str) -> Result<Vec<FileEntry>, String> {
    let tracked = run_git(worktree, &["ls-files", "-z"])?;
    let status = run_git(
        worktree,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let numstat = run_git(worktree, &["diff", "--numstat", "-z", "HEAD"])?;

    let changes: std::collections::HashMap<String, FileChange> =
        parse_status_porcelain(&status).into_iter().collect();
    let mut stats = parse_numstat(&numstat);
    for (path, change) in &changes {
        if *change == FileChange::New && !stats.contains_key(path) {
            stats.insert(path.clone(), untracked_file_stats(worktree, path)?);
        }
    }
    let mut paths: std::collections::BTreeSet<String> =
        tracked.split_terminator('\0').map(str::to_owned).collect();
    paths.extend(changes.keys().cloned());

    Ok(paths
        .into_iter()
        .map(|path| {
            let (dir, name) = split_path(&path);
            let change = changes.get(&path).copied().unwrap_or(FileChange::None);
            let (add, del) = stats.get(&path).copied().unwrap_or((0, 0));
            FileEntry {
                path,
                dir,
                name,
                change,
                add,
                del,
            }
        })
        .collect())
}

fn parse_numstat(output: &str) -> std::collections::HashMap<String, (u32, u32)> {
    if output.contains('\0') {
        let mut records = output.split_terminator('\0');
        let mut stats = std::collections::HashMap::new();
        while let Some(record) = records.next() {
            let mut parts = record.splitn(3, '\t');
            let add = parts.next().and_then(|value| value.parse().ok()).unwrap_or(0);
            let del = parts.next().and_then(|value| value.parse().ok()).unwrap_or(0);
            let Some(path) = parts.next() else {
                continue;
            };
            let target = if path.is_empty() {
                records.next();
                records.next().unwrap_or_default()
            } else {
                path
            };
            if !target.is_empty() {
                stats.insert(target.to_string(), (add, del));
            }
        }
        return stats;
    }

    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let add = parts.next()?.parse().unwrap_or(0);
            let del = parts.next()?.parse().unwrap_or(0);
            let path = parts.next()?.to_string();
            Some((path, (add, del)))
        })
        .collect()
}

fn split_path(path: &str) -> (String, String) {
    match path.rfind('/') {
        Some(index) => (path[..index].to_string(), path[index + 1..].to_string()),
        None => ("/".into(), path.to_string()),
    }
}

fn untracked_file_stats(worktree: &str, relative: &str) -> Result<(u32, u32), String> {
    use std::io::Read;

    crate::files::validate_relative_path(relative)?;
    let base = std::fs::canonicalize(worktree).map_err(|error| error.to_string())?;
    let target = base.join(relative);
    let parent = target.parent().ok_or("파일의 상위 경로가 없음")?;
    let canonical_parent = std::fs::canonicalize(parent).map_err(|error| error.to_string())?;
    if !canonical_parent.starts_with(&base) {
        return Err("worktree 밖 경로 접근 거부".into());
    }

    let metadata = std::fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Ok((1, 0));
    }
    if !metadata.is_file() {
        return Ok((0, 0));
    }

    let mut file = std::fs::File::open(&target).map_err(|error| error.to_string())?;
    let mut buffer = [0_u8; 8192];
    let mut line_breaks = 0_u64;
    let mut saw_bytes = false;
    let mut ends_with_newline = false;
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        if chunk.contains(&0) {
            return Ok((0, 0));
        }
        saw_bytes = true;
        line_breaks += chunk.iter().filter(|byte| **byte == b'\n').count() as u64;
        ends_with_newline = chunk.last() == Some(&b'\n');
    }
    let lines = line_breaks + u64::from(saw_bytes && !ends_with_newline);
    Ok((lines.min(u32::MAX as u64) as u32, 0))
}

/// unified diff 한 파일 분량을 화면 표시용 라인 배열로 변환한다.
pub fn parse_unified_diff(diff: &str) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    let (mut old_no, mut new_no) = (0, 0);

    for line in diff.lines() {
        if line.starts_with("@@") {
            if let Some((old_start, new_start)) = parse_hunk_header(line) {
                old_no = old_start;
                new_no = new_start;
            }
        } else if line.starts_with("+++")
            || line.starts_with("---")
            || line.starts_with("diff ")
            || line.starts_with("index ")
            || line.starts_with("new file")
            || line.starts_with("deleted file")
        {
            continue;
        } else if let Some(text) = line.strip_prefix('+') {
            lines.push(DiffLine {
                kind: "add".into(),
                old_no: None,
                new_no: Some(new_no),
                text: text.to_string(),
            });
            new_no += 1;
        } else if let Some(text) = line.strip_prefix('-') {
            lines.push(DiffLine {
                kind: "del".into(),
                old_no: Some(old_no),
                new_no: None,
                text: text.to_string(),
            });
            old_no += 1;
        } else if let Some(text) = line.strip_prefix(' ') {
            lines.push(DiffLine {
                kind: "ctx".into(),
                old_no: Some(old_no),
                new_no: Some(new_no),
                text: text.to_string(),
            });
            old_no += 1;
            new_no += 1;
        }
    }

    lines
}

fn parse_hunk_header(line: &str) -> Option<(u32, u32)> {
    let body = line.trim_start_matches('@').trim();
    let mut old = None;
    let mut new = None;

    for token in body.split_whitespace() {
        if let Some(value) = token.strip_prefix('-') {
            old = value.split(',').next().and_then(|number| number.parse().ok());
        }
        if let Some(value) = token.strip_prefix('+') {
            new = value.split(',').next().and_then(|number| number.parse().ok());
        }
    }

    Some((old?, new?))
}

/// 파일 한 개의 working tree diff를 화면 표시용 라인 배열로 반환한다.
pub fn file_diff_lines(worktree: &str, relative: &str) -> Result<Vec<DiffLine>, String> {
    crate::files::validate_relative_path(relative)?;
    let diff = run_git(
        worktree,
        &["diff", "HEAD", "--no-color", "--no-ext-diff", "--", relative],
    )?;
    if !diff.trim().is_empty() {
        return Ok(parse_unified_diff(&diff));
    }

    if run_git(
        worktree,
        &["ls-files", "--error-unmatch", "--", relative],
    )
    .is_ok()
    {
        return Ok(Vec::new());
    }

    let untracked = run_git_diff(
        worktree,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-index",
            "--",
            "/dev/null",
            relative,
        ],
    )?;
    Ok(parse_unified_diff(&untracked))
}

/// git 명령을 실행하고 성공 시 stdout을 반환한다. non-zero exit은 에러로 처리한다.
fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git 실행 실패: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {:?} 실패: {}", args, stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// non-zero exit을 허용하고 stdout을 반환한다 (git diff --no-index 등 diff 존재 시 1을 반환하는 경우).
fn run_git_allow_fail(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git 실행 실패: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// diff 존재를 뜻하는 exit code 1만 허용하고 실제 git 오류는 전달한다.
fn run_git_diff(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("git 실행 실패: {error}"))?;
    if !output.status.success() && output.status.code() != Some(1) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {:?} 실패: {}", args, stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod worktree_tests {
    use super::*;
    use std::process::Command;

    /// 커밋 1개가 있는 임시 git 저장소를 만든다.
    fn temp_repo() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wt-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        for args in [
            vec!["init", "-b", "main"],
            vec!["config", "user.email", "t@t.com"],
            vec!["config", "user.name", "t"],
        ] {
            Command::new("git").args(&args).current_dir(p).output().unwrap();
        }
        std::fs::write(dir.join("README.md"), "hi").unwrap();
        Command::new("git").args(["add", "."]).current_dir(p).output().unwrap();
        Command::new("git").args(["commit", "-m", "init"]).current_dir(p).output().unwrap();
        dir
    }

    #[test]
    fn 기존_작업환경의_루트와_현재_브랜치를_반환한다() {
        let repo = temp_repo();
        let nested = repo.join("src");
        std::fs::create_dir_all(&nested).unwrap();

        let workspace = inspect_existing_workspace(nested.to_str().unwrap()).unwrap();

        assert_eq!(
            workspace.path,
            std::fs::canonicalize(&repo)
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        );
        assert_eq!(workspace.branch, "main");
    }

    #[test]
    fn git_저장소가_아닌_경로는_거부한다() {
        let directory = std::env::temp_dir().join(format!("not-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let error = inspect_existing_workspace(directory.to_str().unwrap()).unwrap_err();
        assert!(error.contains("Git 저장소"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn detached_head는_거부한다() {
        let repo = temp_repo();
        let status = Command::new("git")
            .args(["checkout", "--detach"])
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());
        let error = inspect_existing_workspace(repo.to_str().unwrap()).unwrap_err();
        assert!(error.contains("브랜치"));
    }

    #[test]
    fn create_new_branch_worktree() {
        let repo = temp_repo();
        let wt = repo.join("..").join(format!("wt-{}", uuid::Uuid::new_v4()));
        let wt_str = wt.to_str().unwrap();
        let created = create_worktree(repo.to_str().unwrap(), "feat/new", "main", wt_str).unwrap();
        assert!(std::path::Path::new(&created).join("README.md").exists());
        // 정리
        remove_worktree(repo.to_str().unwrap(), &created, true).unwrap();
    }

    #[test]
    fn remove_refuses_dirty_without_force() {
        let repo = temp_repo();
        let wt = repo.join("..").join(format!("wt-{}", uuid::Uuid::new_v4()));
        let wt_str = wt.to_str().unwrap();
        let created = create_worktree(repo.to_str().unwrap(), "feat/d", "main", wt_str).unwrap();
        std::fs::write(std::path::Path::new(&created).join("dirty.txt"), "x").unwrap();
        assert!(worktree_has_changes(&created).unwrap());
        let err = remove_worktree(repo.to_str().unwrap(), &created, false).unwrap_err();
        assert_eq!(err, ERR_WORKTREE_DIRTY);
        // force로 정리
        remove_worktree(repo.to_str().unwrap(), &created, true).unwrap();
    }

    #[test]
    fn dot_git이_있는_경로를_기존_worktree로_판정한다() {
        let dir = std::env::temp_dir().join(format!("existing-wt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        assert!(!is_existing_worktree(dir.to_str().unwrap()));
        std::fs::write(dir.join(".git"), "gitdir: /tmp/example").unwrap();
        assert!(is_existing_worktree(dir.to_str().unwrap()));

        std::fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod file_tests {
    use super::*;
    use std::process::Command;

    fn temp_repo() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("files-list-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for args in [
            &["init", "-b", "main"][..],
            &["config", "user.email", "t@t.com"][..],
            &["config", "user.name", "t"][..],
        ] {
            Command::new("git").args(args).current_dir(&dir).output().unwrap();
        }
        std::fs::write(dir.join("tracked.txt"), "old\n").unwrap();
        Command::new("git").args(["add", "."]).current_dir(&dir).output().unwrap();
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(&dir)
            .output()
            .unwrap();
        dir
    }

    #[test]
    fn porcelain에서_수정_신규_삭제를_파싱한다() {
        let output = " M src/a.rs\n?? src/new.rs\n D src/gone.rs\nA  staged.rs\n";
        let changes = parse_status_porcelain(output);

        assert!(changes.contains(&("src/a.rs".into(), FileChange::Modified)));
        assert!(changes.contains(&("src/new.rs".into(), FileChange::New)));
        assert!(changes.contains(&("src/gone.rs".into(), FileChange::Deleted)));
        assert!(changes.contains(&("staged.rs".into(), FileChange::Modified)));
    }

    #[test]
    fn nul_porcelain에서_한글_공백과_이름변경을_파싱한다() {
        let output = "?? 새 폴더/새 파일.txt\0R  변경 후.txt\0변경 전.txt\0";
        let changes = parse_status_porcelain(output);

        assert!(changes.contains(&("새 폴더/새 파일.txt".into(), FileChange::New)));
        assert!(changes.contains(&("변경 후.txt".into(), FileChange::Modified)));
        assert!(!changes.iter().any(|(path, _)| path == "변경 전.txt"));
    }

    #[test]
    fn numstat에서_파일별_증감을_파싱한다() {
        let stats = parse_numstat("5\t3\tsrc/a.rs\n-\t-\tasset.bin\n");

        assert_eq!(stats.get("src/a.rs"), Some(&(5, 3)));
        assert_eq!(stats.get("asset.bin"), Some(&(0, 0)));
    }

    #[test]
    fn nul_numstat에서_한글_경로와_이름변경을_파싱한다() {
        let stats = parse_numstat("2\t1\t새 폴더/파일.txt\x003\t4\t\0이전.txt\0이후.txt\0");

        assert_eq!(stats.get("새 폴더/파일.txt"), Some(&(2, 1)));
        assert_eq!(stats.get("이후.txt"), Some(&(3, 4)));
        assert!(!stats.contains_key("이전.txt"));
    }

    #[test]
    fn 경로를_디렉터리와_이름으로_나눈다() {
        assert_eq!(split_path("src/a.rs"), ("src".into(), "a.rs".into()));
        assert_eq!(split_path("README.md"), ("/".into(), "README.md".into()));
    }

    #[test]
    fn 미추적_텍스트는_git_프로세스_없이_추가_줄수를_센다() {
        let repo = temp_repo();
        std::fs::write(repo.join("새 파일.txt"), "첫 줄\n둘째 줄").unwrap();

        assert_eq!(untracked_file_stats(repo.to_str().unwrap(), "새 파일.txt").unwrap(), (2, 0));

        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn 추적_파일과_신규_파일을_변경_통계와_함께_나열한다() {
        let repo = temp_repo();
        std::fs::write(repo.join("tracked.txt"), "new\nextra\n").unwrap();
        std::fs::create_dir_all(repo.join("새 폴더")).unwrap();
        std::fs::write(repo.join("새 폴더/새 파일.txt"), "첫 줄\n둘째 줄\n").unwrap();

        let files = list_files(repo.to_str().unwrap()).unwrap();
        let tracked = files.iter().find(|file| file.path == "tracked.txt").unwrap();
        let untracked = files
            .iter()
            .find(|file| file.path == "새 폴더/새 파일.txt")
            .unwrap();

        assert_eq!(tracked.change, FileChange::Modified);
        assert_eq!((tracked.add, tracked.del), (2, 1));
        assert_eq!(untracked.change, FileChange::New);
        assert_eq!((untracked.add, untracked.del), (2, 0));
        std::fs::remove_dir_all(repo).unwrap();
    }
}

#[cfg(test)]
mod diff_tests {
    use super::*;
    use std::process::Command;

    fn temp_repo() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("diff-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for args in [
            &["init", "-b", "main"][..],
            &["config", "user.email", "t@t.com"][..],
            &["config", "user.name", "t"][..],
        ] {
            Command::new("git").args(args).current_dir(&dir).output().unwrap();
        }
        std::fs::write(dir.join("tracked.txt"), "old\n").unwrap();
        Command::new("git").args(["add", "."]).current_dir(&dir).output().unwrap();
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(&dir)
            .output()
            .unwrap();
        dir
    }

    #[test]
    fn 헌크의_추가삭제_라인번호를_추적한다() {
        let diff = "@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n";
        let lines = parse_unified_diff(diff);

        assert_eq!(lines[0].kind, "ctx");
        assert_eq!(lines[0].old_no, Some(1));
        assert_eq!(lines[0].new_no, Some(1));
        assert_eq!(lines[1].kind, "del");
        assert_eq!(lines[1].old_no, Some(2));
        assert_eq!(lines[2].kind, "add");
        assert_eq!(lines[2].new_no, Some(2));
    }

    #[test]
    fn 헌크_헤더에서_시작_라인을_읽는다() {
        assert_eq!(parse_hunk_header("@@ -12,7 +20,8 @@ fn main"), Some((12, 20)));
    }

    #[test]
    fn 수정_파일의_diff_라인을_읽는다() {
        let repo = temp_repo();
        std::fs::write(repo.join("tracked.txt"), "new\n").unwrap();

        let lines = file_diff_lines(repo.to_str().unwrap(), "tracked.txt").unwrap();

        assert!(lines.iter().any(|line| line.kind == "del" && line.text == "old"));
        assert!(lines.iter().any(|line| line.kind == "add" && line.text == "new"));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn 추적하지_않은_파일도_diff_라인을_읽는다() {
        let repo = temp_repo();
        std::fs::write(repo.join("new.txt"), "첫 줄\n").unwrap();

        let lines = file_diff_lines(repo.to_str().unwrap(), "new.txt").unwrap();

        assert!(lines.iter().any(|line| line.kind == "add" && line.text == "첫 줄"));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn 변경하지_않은_추적_파일은_빈_diff를_반환한다() {
        let repo = temp_repo();

        let lines = file_diff_lines(repo.to_str().unwrap(), "tracked.txt").unwrap();

        assert!(lines.is_empty());
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn 파일별_diff는_상위_경로를_거부한다() {
        let repo = temp_repo();

        let error = file_diff_lines(repo.to_str().unwrap(), "../outside.txt").unwrap_err();

        assert_eq!(error, "worktree 밖 경로 접근 거부");
        std::fs::remove_dir_all(repo).unwrap();
    }
}
