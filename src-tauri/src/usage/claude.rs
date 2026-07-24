use serde::Deserialize;

use super::{home_dir, UsageInfo, UsageMetric};

#[derive(Deserialize)]
struct Spool {
    #[serde(default)]
    rate_limits: Option<RateLimits>,
}

#[derive(Deserialize)]
struct RateLimits {
    #[serde(default)]
    five_hour: Option<Window>,
    #[serde(default)]
    seven_day: Option<Window>,
}

#[derive(Deserialize)]
struct Window {
    #[serde(alias = "utilization")]
    used_percentage: f32,
    #[serde(default)]
    resets_at: Option<ResetAt>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ResetAt {
    Epoch(i64),
    Text(String),
}

impl ResetAt {
    fn display(&self) -> String {
        match self {
            Self::Epoch(epoch) => format_reset(*epoch),
            Self::Text(text) => {
                time::OffsetDateTime::parse(text, &time::format_description::well_known::Rfc3339)
                    .map(|timestamp| format_reset(timestamp.unix_timestamp()))
                    .unwrap_or_else(|_| text.clone())
            }
        }
    }
}

fn format_reset(epoch: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let seconds = epoch - now;
    if seconds <= 0 {
        return "곧 초기화".into();
    }

    let hours = seconds / 3600;
    if hours >= 24 {
        format!("{}일 후 초기화", hours / 24)
    } else if hours >= 1 {
        format!("{hours}시간 후 초기화")
    } else {
        format!("{}분 후 초기화", seconds / 60)
    }
}

fn usage_info_from_rate_limits(rate_limits: RateLimits) -> UsageInfo {
    let mut metrics = Vec::new();
    let mut primary_percent = None;
    let mut primary_reset = None;

    if let Some(window) = &rate_limits.five_hour {
        let reset = window.resets_at.as_ref().map(ResetAt::display);
        primary_percent = Some(window.used_percentage);
        primary_reset = reset.clone();
        metrics.push(UsageMetric {
            label: "세션 한도 (5시간)".into(),
            percent: window.used_percentage,
            value_text: format!("{:.0}%", window.used_percentage),
            reset_note: reset.unwrap_or_default(),
        });
    }
    if let Some(window) = &rate_limits.seven_day {
        metrics.push(UsageMetric {
            label: "주간 한도".into(),
            percent: window.used_percentage,
            value_text: format!("{:.0}%", window.used_percentage),
            reset_note: window
                .resets_at
                .as_ref()
                .map(ResetAt::display)
                .unwrap_or_default(),
        });
    }
    if metrics.is_empty() {
        return UsageInfo::disconnected("claude-code", "Claude Code");
    }

    UsageInfo {
        provider: "claude-code".into(),
        full_name: "Claude Code".into(),
        plan: None,
        account: None,
        tier: Some("Anthropic 계정".into()),
        primary_percent,
        primary_reset,
        metrics,
        connected: true,
    }
}

/// Claude Code statusLine 입력 스풀을 공통 사용량 모델로 변환한다.
pub fn parse_spool(json: &str) -> UsageInfo {
    let Ok(spool) = serde_json::from_str::<Spool>(json) else {
        return UsageInfo::disconnected("claude-code", "Claude Code");
    };
    spool
        .rate_limits
        .map(usage_info_from_rate_limits)
        .unwrap_or_else(|| UsageInfo::disconnected("claude-code", "Claude Code"))
}

fn parse_api_usage(json: &str) -> Result<UsageInfo, String> {
    let rate_limits =
        serde_json::from_str::<RateLimits>(json).map_err(|error| error.to_string())?;
    let usage = usage_info_from_rate_limits(rate_limits);
    if usage.connected {
        Ok(usage)
    } else {
        Err("Claude 사용량 API 응답에 한도 정보가 없음".into())
    }
}

#[derive(Deserialize)]
struct Credentials {
    #[serde(rename = "claudeAiOauth")]
    oauth: Option<OAuthCredentials>,
}

#[derive(Deserialize)]
struct OAuthCredentials {
    #[serde(rename = "accessToken")]
    access_token: String,
}

fn token_from_credentials(raw: &str) -> Option<String> {
    serde_json::from_str::<Credentials>(raw)
        .ok()?
        .oauth
        .map(|credentials| credentials.access_token)
        .filter(|token| !token.is_empty())
}

fn oauth_token() -> Option<String> {
    if let Ok(token) = std::env::var("CLAUDE_CODE_OAUTH_TOKEN") {
        if !token.is_empty() {
            return Some(token);
        }
    }

    if let Some(home) = home_dir() {
        let credentials = home.join(".claude").join(".credentials.json");
        if let Ok(raw) = std::fs::read_to_string(credentials) {
            if let Some(token) = token_from_credentials(&raw) {
                return Some(token);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/security")
            .args([
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ])
            .output()
            .ok()?;
        if output.status.success() {
            return token_from_credentials(&String::from_utf8_lossy(&output.stdout));
        }
    }

    None
}

fn read_live_usage() -> Result<UsageInfo, String> {
    let token = oauth_token().ok_or("Claude OAuth 자격 증명 없음")?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header(
            reqwest::header::USER_AGENT,
            concat!("worklane/", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| error.to_string())?;
    let body = response.text().map_err(|error| error.to_string())?;
    parse_api_usage(&body)
}

/// Claude OAuth 사용량 API에서 최신 한도를 조회하고, 실패하면 statusLine 스풀로 폴백한다.
pub fn read_usage() -> UsageInfo {
    if let Ok(usage) = read_live_usage() {
        return usage;
    }
    let disconnected = UsageInfo::disconnected("claude-code", "Claude Code");
    let Some(home) = home_dir() else {
        return disconnected;
    };
    let spool = home.join(".claude").join("aiworkspace-usage.json");

    std::fs::read_to_string(spool)
        .map(|content| parse_spool(&content))
        .unwrap_or(disconnected)
}

/// 기존 Claude 설정을 보존하면서 statusLine 명령만 스풀 스크립트로 교체한다.
pub fn merge_statusline(existing: &str, script_path: &str) -> Result<String, String> {
    let mut root = if existing.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(existing).map_err(|error| error.to_string())?
    };
    let object = root
        .as_object_mut()
        .ok_or("settings.json 최상위가 객체가 아님")?;

    let previous_command = object
        .get("statusLine")
        .and_then(|status_line| status_line.get("command"))
        .and_then(|command| command.as_str())
        .map(str::to_owned);
    let previous_delegate = object
        .get("statusLine")
        .and_then(|status_line| status_line.get("aiworkspaceDelegate"))
        .and_then(|delegate| delegate.as_str())
        .map(str::to_owned);

    let delegate = match previous_command {
        Some(command) if command == script_path => previous_delegate,
        Some(command) => Some(command),
        None => None,
    };

    let mut status_line = object
        .get("statusLine")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    status_line.insert("type".into(), serde_json::json!("command"));
    status_line.insert("command".into(), serde_json::json!(script_path));
    if let Some(delegate) = delegate {
        status_line.insert("aiworkspaceDelegate".into(), serde_json::json!(delegate));
    } else {
        status_line.remove("aiworkspaceDelegate");
    }
    object.insert("statusLine".into(), serde_json::Value::Object(status_line));

    serde_json::to_string_pretty(&root).map_err(|error| error.to_string())
}

/// 문자열을 POSIX 셸의 안전한 작은따옴표 리터럴로 변환한다.
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn build_statusline_script(spool_path: &std::path::Path, delegate: &str) -> String {
    let spool = shell_single_quote(&spool_path.to_string_lossy());
    let delegate = shell_single_quote(delegate);

    format!(
        "#!/usr/bin/env bash\nIN=$(cat)\nSPOOL={spool}\nTEMPORARY=\"${{SPOOL}}.tmp.$$\"\ntrap 'rm -f -- \"$TEMPORARY\"' EXIT\nprintf '%s' \"$IN\" > \"$TEMPORARY\"\nmv -f -- \"$TEMPORARY\" \"$SPOOL\"\ntrap - EXIT\nDELEGATE={delegate}\nif [ -n \"$DELEGATE\" ]; then\n  printf '%s' \"$IN\" | bash -lc \"$DELEGATE\"\nfi\n"
    )
}

#[cfg(any(windows, test))]
fn powershell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(any(windows, test))]
fn build_statusline_powershell(spool_path: &std::path::Path, delegate: &str) -> String {
    let spool = powershell_single_quote(&spool_path.to_string_lossy().replace('\\', "/"));
    let delegate = powershell_single_quote(delegate);

    format!(
        "$inputJson = [Console]::In.ReadToEnd()\n$spool = {spool}\n$temporary = \"$spool.$PID.tmp\"\ntry {{\n  [System.IO.File]::WriteAllText($temporary, $inputJson, [System.Text.UTF8Encoding]::new($false))\n  Move-Item -LiteralPath $temporary -Destination $spool -Force\n}} finally {{\n  if (Test-Path -LiteralPath $temporary) {{ Remove-Item -LiteralPath $temporary -Force }}\n}}\n$delegate = {delegate}\nif (-not [string]::IsNullOrWhiteSpace($delegate)) {{\n  $delegateScript = [scriptblock]::Create('$input | ' + $delegate)\n  $inputJson | & $delegateScript\n}}\n"
    )
}

#[cfg(any(windows, test))]
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        output.push(ALPHABET[(first >> 2) as usize] as char);
        output.push(ALPHABET[(((first & 0b11) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(ALPHABET[(((second & 0b1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(ALPHABET[(third & 0b11_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

#[cfg(any(windows, test))]
fn windows_statusline_command(script_path: &std::path::Path) -> String {
    let path = script_path.to_string_lossy().replace('\\', "/");
    let invocation = format!("& {}", powershell_single_quote(&path));
    let encoded: Vec<u8> = invocation
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    format!(
        "powershell -NoProfile -EncodedCommand {}",
        base64_encode(&encoded)
    )
}

#[cfg(any(windows, test))]
fn replace_file_with_rollback(
    temporary_path: &std::path::Path,
    path: &std::path::Path,
) -> Result<(), String> {
    let parent = path.parent().ok_or("설정 파일의 상위 디렉터리가 없음")?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("설정 파일 이름이 올바르지 않음")?;
    let displaced = parent.join(format!(".{file_name}.{}.previous", uuid::Uuid::new_v4()));
    let had_original = path.exists();
    if had_original {
        std::fs::rename(path, &displaced).map_err(|error| error.to_string())?;
    }

    match std::fs::rename(temporary_path, path) {
        Ok(()) => {
            if had_original {
                let _ = std::fs::remove_file(displaced);
            }
            Ok(())
        }
        Err(error) => {
            if had_original {
                std::fs::rename(&displaced, path).map_err(|restore_error| {
                    format!("설정 교체 실패: {error}; 기존 설정 복원 실패: {restore_error}")
                })?;
            }
            Err(format!("설정 교체 실패: {error}"))
        }
    }
}

#[cfg(windows)]
fn replace_temporary_file(
    temporary_path: &std::path::Path,
    path: &std::path::Path,
) -> Result<(), String> {
    replace_file_with_rollback(temporary_path, path)
}

#[cfg(not(windows))]
fn replace_temporary_file(
    temporary_path: &std::path::Path,
    path: &std::path::Path,
) -> Result<(), String> {
    std::fs::rename(temporary_path, path).map_err(|error| error.to_string())
}

fn write_atomic_with_backup(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;

    let parent = path.parent().ok_or("설정 파일의 상위 디렉터리가 없음")?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("설정 파일 이름이 올바르지 않음")?;
    let backup_path = parent.join(format!("{file_name}.aiworkspace-backup"));

    if path.exists() && !backup_path.exists() {
        std::fs::copy(path, &backup_path).map_err(|error| error.to_string())?;
    }

    let temporary_path = parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut temporary =
            std::fs::File::create(&temporary_path).map_err(|error| error.to_string())?;
        temporary
            .write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        temporary.sync_all().map_err(|error| error.to_string())?;

        if let Ok(metadata) = std::fs::metadata(path) {
            std::fs::set_permissions(&temporary_path, metadata.permissions())
                .map_err(|error| error.to_string())?;
        }

        replace_temporary_file(&temporary_path, path)
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

/// ~/.claude에 스풀 스크립트를 쓰고 settings.json을 갱신한다.
#[cfg(unix)]
pub fn install_statusline() -> Result<(), String> {
    install_statusline_unix()
}

#[cfg(windows)]
pub fn install_statusline() -> Result<(), String> {
    install_statusline_windows()
}

#[cfg(not(any(unix, windows)))]
pub fn install_statusline() -> Result<(), String> {
    Err("Claude statusLine 자동 설치를 지원하지 않는 플랫폼입니다.".into())
}

#[cfg(unix)]
fn install_statusline_unix() -> Result<(), String> {
    let home = home_dir().ok_or("홈 디렉터리 환경변수 없음")?;
    let directory = home.join(".claude");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let script_path = directory.join("aiworkspace-statusline.sh");
    let spool_path = directory.join("aiworkspace-usage.json");
    let settings_path = directory.join("settings.json");
    let existing = match std::fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let script_path_text = script_path.to_string_lossy().into_owned();
    let merged = merge_statusline(&existing, &script_path_text)?;
    let delegate = serde_json::from_str::<serde_json::Value>(&merged)
        .ok()
        .and_then(|settings| {
            settings
                .get("statusLine")?
                .get("aiworkspaceDelegate")?
                .as_str()
                .map(str::to_owned)
        })
        .unwrap_or_default();
    let script = build_statusline_script(&spool_path, &delegate);

    std::fs::write(&script_path, script).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = std::fs::metadata(&script_path)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&script_path, permissions).map_err(|error| error.to_string())?;
    }
    write_atomic_with_backup(&settings_path, &merged)
}

#[cfg(windows)]
fn install_statusline_windows() -> Result<(), String> {
    let home = home_dir().ok_or("홈 디렉터리 환경변수 없음")?;
    install_statusline_windows_at(&home)
}

#[cfg(any(windows, test))]
fn install_statusline_windows_at(home: &std::path::Path) -> Result<(), String> {
    let directory = home.join(".claude");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let script_path = directory.join("aiworkspace-statusline.ps1");
    let spool_path = directory.join("aiworkspace-usage.json");
    let settings_path = directory.join("settings.json");
    let existing = match std::fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let command = windows_statusline_command(&script_path);
    let merged = merge_statusline(&existing, &command)?;
    let delegate = serde_json::from_str::<serde_json::Value>(&merged)
        .ok()
        .and_then(|settings| {
            settings
                .get("statusLine")?
                .get("aiworkspaceDelegate")?
                .as_str()
                .map(str::to_owned)
        })
        .unwrap_or_default();
    let script = build_statusline_powershell(&spool_path, &delegate);

    std::fs::write(script_path, script).map_err(|error| error.to_string())?;
    write_atomic_with_backup(&settings_path, &merged)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPOOL: &str = r#"{"rate_limits":{"five_hour":{"used_percentage":62,"resets_at":"3시간 후"},"seven_day":{"used_percentage":41,"resets_at":"월요일"}}}"#;

    #[test]
    fn 스풀에서_5시간과_주간_퍼센트를_읽는다() {
        let info = parse_spool(SPOOL);

        assert!(info.connected);
        assert_eq!(info.primary_percent, Some(62.0));
        assert_eq!(info.primary_reset.as_deref(), Some("3시간 후"));
        assert_eq!(info.metrics.len(), 2);
        assert_eq!(info.metrics[0].percent, 62.0);
        assert_eq!(info.metrics[1].percent, 41.0);
    }

    #[test]
    fn oauth_api_응답에서_최신_한도를_읽는다() {
        let info = parse_api_usage(
            r#"{"five_hour":{"utilization":9.0,"resets_at":"2026-07-24T12:39:59Z"},"seven_day":{"utilization":77.0,"resets_at":"2026-07-26T09:59:59Z"},"extra_usage":{"is_enabled":false}}"#,
        )
        .unwrap();

        assert_eq!(info.primary_percent, Some(9.0));
        assert_eq!(info.metrics[1].percent, 77.0);
        assert!(!info.metrics[0].reset_note.is_empty());
    }

    #[test]
    fn 자격증명_json에서_oauth_토큰을_읽는다() {
        assert_eq!(
            token_from_credentials(r#"{"claudeAiOauth":{"accessToken":"secret","expiresAt":0}}"#)
                .as_deref(),
            Some("secret")
        );
        assert!(token_from_credentials("{}").is_none());
    }

    #[test]
    fn 숫자형_초기화_시각이_포함된_실제_스풀을_읽는다() {
        let info = parse_spool(
            r#"{"rate_limits":{"five_hour":{"used_percentage":14.0,"resets_at":1784878800},"seven_day":{"used_percentage":65,"resets_at":1785060000}}}"#,
        );

        assert!(info.connected);
        assert_eq!(info.primary_percent, Some(14.0));
        assert_eq!(info.metrics.len(), 2);
        assert!(!info.metrics[0].reset_note.is_empty());
        assert!(!info.metrics[1].reset_note.is_empty());
    }

    #[test]
    fn rate_limits가_없으면_연동_대기_상태를_반환한다() {
        let info = parse_spool("{}");

        assert!(!info.connected);
        assert!(info.metrics.is_empty());
    }
}

#[cfg(test)]
mod install_tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn 빈_설정에_statusline을_추가한다() {
        let output = merge_statusline("", "/path/spool.sh").unwrap();

        assert!(output.contains("\"command\": \"/path/spool.sh\""));
        assert!(!output.contains("aiworkspaceDelegate"));
    }

    #[test]
    fn 기존_command를_위임값으로_보존한다() {
        let existing = r#"{"statusLine":{"type":"command","command":"/old/hud.sh","padding":1},"theme":"dark"}"#;
        let output = merge_statusline(existing, "/path/spool.sh").unwrap();

        assert!(output.contains("\"aiworkspaceDelegate\": \"/old/hud.sh\""));
        assert!(output.contains("\"padding\": 1"));
        assert!(output.contains("\"theme\": \"dark\""));
    }

    #[test]
    fn 재설치해도_기존_위임값을_유지한다() {
        let existing = r#"{"statusLine":{"type":"command","command":"/path/spool.sh","aiworkspaceDelegate":"/old/hud.sh"}}"#;
        let output = merge_statusline(existing, "/path/spool.sh").unwrap();

        assert!(output.contains("\"aiworkspaceDelegate\": \"/old/hud.sh\""));
    }

    #[test]
    fn 셸_리터럴은_작은따옴표를_분리해_이스케이프한다() {
        assert_eq!(
            shell_single_quote("경로' 이름/hud.sh"),
            "'경로'\"'\"' 이름/hud.sh'"
        );
    }

    #[test]
    fn 스크립트에_스풀과_위임값을_셸_리터럴로_넣는다() {
        let output =
            build_statusline_script(Path::new("/tmp/사용량 파일.json"), "경로' 이름/hud.sh");

        assert!(output.contains("SPOOL='/tmp/사용량 파일.json'"));
        assert!(output.contains("DELEGATE='경로'\"'\"' 이름/hud.sh'"));
        assert!(output.contains("printf '%s' \"$IN\" > \"$TEMPORARY\""));
        assert!(output.contains("mv -f -- \"$TEMPORARY\" \"$SPOOL\""));
        assert!(output.contains("printf '%s' \"$IN\" | bash -lc \"$DELEGATE\""));
    }

    #[test]
    fn powershell_스크립트는_원자_스풀과_위임을_지원한다() {
        let output = build_statusline_powershell(
            Path::new("C:/Users/사용자 이름/.claude/usage.json"),
            "& 'C:/도구/상태.ps1' -Mode compact",
        );

        assert!(output.contains("$spool = 'C:/Users/사용자 이름/.claude/usage.json'"));
        assert!(output.contains("$delegate = '& ''C:/도구/상태.ps1'' -Mode compact'"));
        assert!(output.contains("[System.IO.File]::WriteAllText($temporary, $inputJson"));
        assert!(output.contains("Move-Item -LiteralPath $temporary -Destination $spool -Force"));
        assert!(output.contains("$delegateScript = [scriptblock]::Create('$input | ' + $delegate)"));
        assert!(output.contains("$inputJson | & $delegateScript"));
    }

    #[test]
    fn windows_statusline_command는_셸과_사용자_경로에_독립적이다() {
        let first = windows_statusline_command(Path::new(
            "C:/Users/사용자 이름/.claude/aiworkspace-statusline.ps1",
        ));
        let second = windows_statusline_command(Path::new(
            "D:/다른 사용자/.claude/aiworkspace-statusline.ps1",
        ));

        assert!(first.starts_with("powershell -NoProfile -EncodedCommand "));
        assert_ne!(first, second);
        assert!(!first.contains('~'));
        assert_eq!(base64_encode(b"Man"), "TWFu");
    }

    #[test]
    fn windows_설치는_powershell_도우미와_위임_설정을_생성한다() {
        let home = std::env::temp_dir().join(format!("windows-hook-{}", uuid::Uuid::new_v4()));
        let directory = home.join(".claude");
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join("settings.json"),
            r#"{"statusLine":{"type":"command","command":"기존 상태 명령 --compact"}}"#,
        )
        .unwrap();

        install_statusline_windows_at(&home).unwrap();

        let settings = std::fs::read_to_string(directory.join("settings.json")).unwrap();
        let script = std::fs::read_to_string(directory.join("aiworkspace-statusline.ps1")).unwrap();
        assert!(settings.contains(&windows_statusline_command(
            &directory.join("aiworkspace-statusline.ps1")
        )));
        assert!(settings.contains("기존 상태 명령 --compact"));
        assert!(script.contains("$delegate = '기존 상태 명령 --compact'"));
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn 교체_실패시_기존_설정을_즉시_복원한다() {
        let directory =
            std::env::temp_dir().join(format!("replace-rollback-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let settings = directory.join("settings.json");
        let missing_temporary = directory.join("missing.tmp");
        std::fs::write(&settings, "기존 설정").unwrap();

        assert!(replace_file_with_rollback(&missing_temporary, &settings).is_err());
        assert_eq!(std::fs::read_to_string(&settings).unwrap(), "기존 설정");

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn 설정을_원자_교체하고_최초_백업을_보존한다() {
        let dir = std::env::temp_dir().join(format!("settings-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let settings = dir.join("settings.json");
        let backup = dir.join("settings.json.aiworkspace-backup");
        std::fs::write(&settings, "이전 설정").unwrap();

        write_atomic_with_backup(&settings, "새 설정").unwrap();
        write_atomic_with_backup(&settings, "최신 설정").unwrap();

        assert_eq!(std::fs::read_to_string(&settings).unwrap(), "최신 설정");
        assert_eq!(std::fs::read_to_string(&backup).unwrap(), "이전 설정");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
