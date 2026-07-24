use std::process::Command;
use std::time::Instant;

/// 검증 명령 실행 결과.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub output_tail: String,
}

/// worktree에서 검증 명령(테스트/빌드 등)을 실행하고 종료코드·소요시간·출력 tail을 반환한다.
pub fn run_verification(worktree: &str, command: &str) -> Result<VerifyResult, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("검증 명령을 입력하세요.".into());
    }
    let start = Instant::now();
    let output = build_verify_command(command)
        .current_dir(worktree)
        .output()
        .map_err(|e| format!("검증 명령 실행 실패: {e}"))?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok(VerifyResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        duration_ms,
        output_tail: tail_lines(&combined, 40),
    })
}

/// PATH 확보를 위해 사용자 로그인 셸로 감싸 실행한다(PTY의 build_command과 동일 취지, 비대화형).
#[cfg(unix)]
fn build_verify_command(cmd: &str) -> Command {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let mut command = Command::new(shell);
    command.arg("-l").arg("-c").arg(cmd);
    command
}

#[cfg(windows)]
fn build_verify_command(cmd: &str) -> Command {
    let mut command = Command::new("cmd");
    command.arg("/C").arg(cmd);
    command
}

/// 문자열의 마지막 n줄만 남긴다.
fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tail은_마지막_n줄만_남긴다() {
        assert_eq!(tail_lines("a\nb\nc\nd", 2), "c\nd");
    }

    #[test]
    fn tail은_줄수가_적으면_전체를_반환한다() {
        assert_eq!(tail_lines("a\nb", 5), "a\nb");
    }

    #[test]
    fn tail은_빈_문자열도_안전하다() {
        assert_eq!(tail_lines("", 3), "");
    }
}
