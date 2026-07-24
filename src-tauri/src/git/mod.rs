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

/// 검토 화면의 커밋/푸시 상태 요약.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStatus {
    /// 현재 체크아웃된 브랜치명
    pub branch: String,
    /// working tree의 uncommitted 변경 파일 수(추적/미추적 포함)
    pub changed_count: u32,
    /// 추적 브랜치(@{u})가 설정돼 있는가
    pub has_upstream: bool,
    /// 추적 브랜치보다 앞선(푸시 안 된) 커밋 수
    pub ahead: u32,
    /// 추적 브랜치보다 뒤진 커밋 수
    pub behind: u32,
    /// origin 원격이 설정돼 있는가
    pub has_remote: bool,
}

/// 검토 대상 worktree의 커밋/푸시 상태를 요약한다.
pub fn review_status(worktree: &str) -> Result<ReviewStatus, String> {
    let branch = run_git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    let porcelain = run_git(worktree, &["status", "--porcelain"])?;
    let changed_count = porcelain.lines().filter(|l| !l.trim().is_empty()).count() as u32;

    let has_remote = !run_git_allow_fail(worktree, &["remote"])
        .unwrap_or_default()
        .trim()
        .is_empty();

    let upstream = run_git_allow_fail(
        worktree,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .unwrap_or_default()
    .trim()
    .to_string();
    let has_upstream = !upstream.is_empty();

    let (ahead, behind) = if has_upstream {
        // "<behind>\t<ahead>" 형식으로 반환된다.
        let counts = run_git_allow_fail(
            worktree,
            &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
        )
        .unwrap_or_default();
        let mut it = counts.split_whitespace();
        let behind = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let ahead = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    };

    Ok(ReviewStatus { branch, changed_count, has_upstream, ahead, behind, has_remote })
}

/// worktree의 모든 변경(추적/미추적)을 스테이징한 뒤 커밋한다. 변경이 없으면 에러.
pub fn commit_all(worktree: &str, message: &str) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("커밋 메시지를 입력하세요.".to_string());
    }
    if !worktree_has_changes(worktree)? {
        return Err("커밋할 변경이 없습니다.".to_string());
    }
    run_git(worktree, &["add", "-A"])?;
    run_git(worktree, &["commit", "-m", message])?;
    Ok(())
}

/// 현재 브랜치를 origin에 푸시하고 upstream을 설정한다. 푸시한 브랜치명을 반환한다.
pub fn push_current_branch(worktree: &str) -> Result<String, String> {
    let branch = run_git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    run_git(worktree, &["push", "-u", "origin", &branch])?;
    Ok(branch)
}

/// 저장소 기본 브랜치명을 origin/HEAD로 추정한다. 실패 시 "main".
pub fn default_base_branch(worktree: &str) -> String {
    run_git_allow_fail(worktree, &["rev-parse", "--abbrev-ref", "origin/HEAD"])
        .unwrap_or_default()
        .trim()
        .strip_prefix("origin/")
        .map(|b| b.to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "main".to_string())
}

/// git 원격 URL 문자열을 https 웹 URL(https://host/owner/repo)로 정규화한다.
fn normalize_remote_url(raw: &str) -> Option<String> {
    let stripped = raw.trim().strip_suffix(".git").unwrap_or(raw.trim());
    if let Some(rest) = stripped.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        return Some(format!("https://{host}/{path}"));
    }
    if let Some(rest) = stripped.strip_prefix("ssh://") {
        let rest = rest.strip_prefix("git@").unwrap_or(rest);
        let (host, path) = rest.split_once('/')?;
        return Some(format!("https://{host}/{path}"));
    }
    if stripped.starts_with("https://") || stripped.starts_with("http://") {
        return Some(stripped.to_string());
    }
    None
}

/// GitHub compare 페이지 URL을 만든다.
fn compare_url(web: &str, base: &str, branch: &str) -> String {
    format!("{web}/compare/{base}...{branch}?expand=1")
}

/// origin 원격의 웹 베이스 URL을 반환한다.
fn remote_web_url(worktree: &str) -> Option<String> {
    let raw = run_git_allow_fail(worktree, &["remote", "get-url", "origin"])
        .ok()?
        .trim()
        .to_string();
    if raw.is_empty() {
        return None;
    }
    normalize_remote_url(&raw)
}

/// PR 생성/조회 결과.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    /// 열 URL(gh로 만든 PR 또는 GitHub compare 페이지)
    pub url: String,
    /// "gh" 또는 "compare"
    pub mode: String,
}

fn gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_gh(worktree: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(worktree)
        .output()
        .map_err(|e| format!("gh 실행 실패: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh {:?} 실패: {}", args, stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// PR을 생성(또는 조회)하거나 compare 페이지 URL을 반환한다.
/// gh CLI가 있으면 PR을 만들고, 없으면 GitHub compare 페이지로 폴백한다.
pub fn open_pull_request(worktree: &str) -> Result<PullRequest, String> {
    let base = default_base_branch(worktree);
    let branch = run_git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    if gh_available() {
        match run_gh(
            worktree,
            &["pr", "create", "--base", &base, "--head", &branch, "--fill"],
        ) {
            Ok(out) => {
                let url = out
                    .lines()
                    .rev()
                    .find(|l| l.trim_start().starts_with("http"))
                    .unwrap_or_else(|| out.trim())
                    .trim()
                    .to_string();
                return Ok(PullRequest { url, mode: "gh".into() });
            }
            Err(create_err) => {
                // 이미 PR이 있으면 create가 실패한다 → view로 기존 PR URL 조회.
                if let Ok(out) = run_gh(worktree, &["pr", "view", "--json", "url", "--jq", ".url"]) {
                    let url = out.trim().to_string();
                    if !url.is_empty() {
                        return Ok(PullRequest { url, mode: "gh".into() });
                    }
                }
                // gh는 있으나 실패 → compare 폴백.
                if let Some(web) = remote_web_url(worktree) {
                    return Ok(PullRequest {
                        url: compare_url(&web, &base, &branch),
                        mode: "compare".into(),
                    });
                }
                return Err(create_err);
            }
        }
    }

    match remote_web_url(worktree) {
        Some(web) => Ok(PullRequest {
            url: compare_url(&web, &base, &branch),
            mode: "compare".into(),
        }),
        None => Err("origin 원격을 찾을 수 없어 PR 페이지를 열 수 없습니다.".to_string()),
    }
}

/// GitHub 이슈 한 건.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GithubIssue {
    pub number: u64,
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub body: String,
}

/// 저장소의 열린 GitHub 이슈를 gh CLI로 조회한다(최근 30건).
pub fn list_github_issues(repo_path: &str) -> Result<Vec<GithubIssue>, String> {
    if !gh_available() {
        return Err("gh CLI가 설치되어 있지 않습니다. GitHub CLI 설치·인증 후 사용하세요.".into());
    }
    let out = run_gh(
        repo_path,
        &["issue", "list", "--json", "number,title,url,body", "--limit", "30"],
    )?;
    serde_json::from_str(&out).map_err(|e| format!("이슈 목록 파싱 실패: {e}"))
}

/// working tree(추적 파일 기준)의 스냅샷 커밋을 만든다. 변경이 없으면 None.
pub fn snapshot_worktree(worktree: &str) -> Result<Option<String>, String> {
    let sha = run_git(worktree, &["stash", "create"])?.trim().to_string();
    Ok(if sha.is_empty() { None } else { Some(sha) })
}

/// 스냅샷 커밋을 refs/worklane/checkpoints/<id>로 고정해 GC를 막는다.
pub fn anchor_checkpoint(worktree: &str, id: &str, sha: &str) -> Result<(), String> {
    run_git(
        worktree,
        &["update-ref", &format!("refs/worklane/checkpoints/{id}"), sha],
    )?;
    Ok(())
}

/// 고정한 체크포인트 ref를 제거한다(없어도 실패하지 않는다).
pub fn drop_checkpoint_ref(worktree: &str, id: &str) {
    let _ = run_git_allow_fail(
        worktree,
        &["update-ref", "-d", &format!("refs/worklane/checkpoints/{id}")],
    );
}

/// working tree를 스냅샷 상태로 되돌린다(추적 파일 기준).
pub fn restore_snapshot(worktree: &str, sha: &str) -> Result<(), String> {
    run_git(worktree, &["restore", "--source", sha, "--staged", "--worktree", "--", "."])?;
    Ok(())
}

/// git 명령을 실행하고 (성공여부, stdout)을 반환한다. 종료코드로 판단할 때 쓴다.
fn run_git_capture(cwd: &str, args: &[&str]) -> Result<(bool, String), String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git 실행 실패: {e}"))?;
    Ok((output.status.success(), String::from_utf8_lossy(&output.stdout).into_owned()))
}

/// 종료코드 0이면 true(그 외 false). is-ancestor/rev-parse --verify 등에 쓴다.
fn git_bool(cwd: &str, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 로컬 base 브랜치가 있으면 그 이름을, 없으면 origin/base를 쓴다.
fn resolve_base_ref(worktree: &str, base: &str) -> Result<String, String> {
    if git_bool(worktree, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{base}")]) {
        Ok(base.to_string())
    } else if git_bool(
        worktree,
        &["rev-parse", "--verify", "--quiet", &format!("refs/remotes/origin/{base}")],
    ) {
        Ok(format!("origin/{base}"))
    } else {
        Err(format!("기준 브랜치 {base}를 찾을 수 없습니다."))
    }
}

/// `git merge-tree --write-tree --name-only` 결과에서 충돌 파일 목록을 뽑는다.
/// 성공(충돌 없음)이면 빈 벡터. 첫 줄은 tree OID이므로 제외한다.
fn parse_merge_tree_conflicts(success: bool, stdout: &str) -> Vec<String> {
    if success {
        return Vec::new();
    }
    stdout
        .lines()
        .skip(1)
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}

/// `git worktree list --porcelain`에서 base 브랜치를 체크아웃한 worktree 경로를 찾는다.
fn parse_worktree_for_branch(porcelain: &str, base: &str) -> Option<String> {
    let target = format!("refs/heads/{base}");
    let mut current_path: Option<String> = None;
    for line in porcelain.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = Some(path.trim().to_string());
        } else if let Some(branch) = line.strip_prefix("branch ") {
            if branch.trim() == target {
                return current_path.clone();
            }
        }
    }
    None
}

/// 병합 미리보기 결과.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub base: String,
    pub branch: String,
    /// 충돌 파일 목록(비면 깨끗)
    pub conflicts: Vec<String>,
    /// branch가 이미 base에 병합돼 있는가(병합 불필요)
    pub already_merged: bool,
    /// base 브랜치가 어떤 worktree에 체크아웃돼 있는가
    pub base_checked_out: bool,
}

fn merge_tree_conflicts(worktree: &str, base_ref: &str, branch: &str) -> Result<Vec<String>, String> {
    let (success, stdout) = run_git_capture(
        worktree,
        &["merge-tree", "--write-tree", "--name-only", base_ref, branch],
    )?;
    Ok(parse_merge_tree_conflicts(success, &stdout))
}

/// 현재 브랜치를 기준 브랜치에 병합했을 때의 충돌/상태를 미리 계산한다.
pub fn merge_preview(worktree: &str) -> Result<MergePreview, String> {
    let base = default_base_branch(worktree);
    let branch = run_git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let base_ref = resolve_base_ref(worktree, &base)?;

    let already_merged = git_bool(worktree, &["merge-base", "--is-ancestor", &branch, &base_ref]);
    let conflicts = merge_tree_conflicts(worktree, &base_ref, &branch)?;
    let base_checked_out = worktree_for_branch(worktree, &base)?.is_some();

    Ok(MergePreview { base, branch, conflicts, already_merged, base_checked_out })
}

fn worktree_for_branch(worktree: &str, base: &str) -> Result<Option<String>, String> {
    let list = run_git(worktree, &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_for_branch(&list, base))
}

/// 현재 브랜치를 기준 브랜치에 로컬 병합한다.
/// base가 체크아웃된 worktree가 있으면 거기서 병합하고(깨끗할 때만),
/// 없으면 merge-tree + commit-tree + update-ref로 체크아웃 없이 병합한다.
pub fn merge_into_base(worktree: &str) -> Result<String, String> {
    let base = default_base_branch(worktree);
    let branch = run_git(worktree, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let base_ref = resolve_base_ref(worktree, &base)?;

    if git_bool(worktree, &["merge-base", "--is-ancestor", &branch, &base_ref]) {
        return Err("이미 기준 브랜치에 병합된 상태입니다.".to_string());
    }
    let conflicts = merge_tree_conflicts(worktree, &base_ref, &branch)?;
    if !conflicts.is_empty() {
        return Err(format!("충돌로 병합할 수 없습니다: {}", conflicts.join(", ")));
    }

    if let Some(base_path) = worktree_for_branch(worktree, &base)? {
        if worktree_has_changes(&base_path)? {
            return Err("기준 브랜치 worktree에 커밋 안 된 변경이 있어 병합할 수 없습니다.".to_string());
        }
        run_git(&base_path, &["merge", "--no-ff", "--no-edit", &branch])?;
    } else {
        let tree = run_git(worktree, &["merge-tree", "--write-tree", &base_ref, &branch])?
            .trim()
            .to_string();
        let message = format!("Merge {branch} into {base}");
        let commit = run_git(
            worktree,
            &["commit-tree", &tree, "-p", &base_ref, "-p", &branch, "-m", &message],
        )?
        .trim()
        .to_string();
        run_git(worktree, &["update-ref", &format!("refs/heads/{base}"), &commit])?;
    }
    Ok(format!("{base} 브랜치에 병합했습니다."))
}

#[cfg(test)]
mod review_tests {
    use super::*;

    #[test]
    fn scp_형식_원격을_https로_변환한다() {
        assert_eq!(
            normalize_remote_url("git@github.com:owner/repo.git"),
            Some("https://github.com/owner/repo".to_string())
        );
    }

    #[test]
    fn https_원격은_git_접미사만_제거한다() {
        assert_eq!(
            normalize_remote_url("https://github.com/owner/repo.git"),
            Some("https://github.com/owner/repo".to_string())
        );
    }

    #[test]
    fn ssh_형식_원격을_https로_변환한다() {
        assert_eq!(
            normalize_remote_url("ssh://git@github.com/owner/repo.git"),
            Some("https://github.com/owner/repo".to_string())
        );
    }

    #[test]
    fn 알수없는_형식은_none() {
        assert_eq!(normalize_remote_url("file:///tmp/repo"), None);
    }

    #[test]
    fn compare_url을_만든다() {
        assert_eq!(
            compare_url("https://github.com/owner/repo", "main", "feat/x"),
            "https://github.com/owner/repo/compare/main...feat/x?expand=1"
        );
    }

    #[test]
    fn merge_tree_성공이면_충돌이_없다() {
        assert!(parse_merge_tree_conflicts(true, "abc123treeoid").is_empty());
    }

    #[test]
    fn merge_tree_실패면_첫줄_제외한_충돌파일을_읽는다() {
        let out = "treeoid\nsrc/a.rs\nsrc/b.rs\n";
        assert_eq!(
            parse_merge_tree_conflicts(false, out),
            vec!["src/a.rs".to_string(), "src/b.rs".to_string()]
        );
    }

    #[test]
    fn worktree_list에서_base_브랜치_경로를_찾는다() {
        let porcelain = "worktree /repo/main\nHEAD aaa\nbranch refs/heads/main\n\nworktree /repo/feat\nHEAD bbb\nbranch refs/heads/feat/x\n";
        assert_eq!(
            parse_worktree_for_branch(porcelain, "main"),
            Some("/repo/main".to_string())
        );
        assert_eq!(parse_worktree_for_branch(porcelain, "release"), None);
    }
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
