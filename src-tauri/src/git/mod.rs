use std::process::Command;

/// worktree에 uncommitted 변경이 있어 remove가 거부됐음을 나타내는 판별 문자열.
pub const ERR_WORKTREE_DIRTY: &str = "WORKTREE_DIRTY";

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
        &["ls-files", "--others", "--exclude-standard"],
    )?;

    let mut out = tracked;
    for path in untracked_files.lines().filter(|l| !l.trim().is_empty()) {
        // /dev/null 대비 새 파일 diff. --no-index는 non-zero exit을 내므로 상태코드를 무시한다.
        if let Ok(d) = run_git_allow_fail(
            repo_root,
            &["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", path],
        ) {
            out.push_str(&d);
        }
    }

    Ok(out)
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
}
