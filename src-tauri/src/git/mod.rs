use std::process::Command;

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
