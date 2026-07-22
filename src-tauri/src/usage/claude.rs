use serde::Deserialize;

use super::{UsageInfo, UsageMetric};

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
    used_percentage: f32,
    #[serde(default)]
    resets_at: Option<String>,
}

/// Claude Code statusLine 입력 스풀을 공통 사용량 모델로 변환한다.
pub fn parse_spool(json: &str) -> UsageInfo {
    let disconnected = UsageInfo::disconnected("claude-code", "Claude Code");
    let Ok(spool) = serde_json::from_str::<Spool>(json) else {
        return disconnected;
    };
    let Some(rate_limits) = spool.rate_limits else {
        return disconnected;
    };

    let mut metrics = Vec::new();
    let mut primary_percent = None;
    let mut primary_reset = None;

    if let Some(window) = &rate_limits.five_hour {
        primary_percent = Some(window.used_percentage);
        primary_reset = window.resets_at.clone();
        metrics.push(UsageMetric {
            label: "세션 한도 (5시간)".into(),
            percent: window.used_percentage,
            value_text: format!("{:.0}%", window.used_percentage),
            reset_note: window.resets_at.clone().unwrap_or_default(),
        });
    }
    if let Some(window) = &rate_limits.seven_day {
        metrics.push(UsageMetric {
            label: "주간 한도".into(),
            percent: window.used_percentage,
            value_text: format!("{:.0}%", window.used_percentage),
            reset_note: window.resets_at.clone().unwrap_or_default(),
        });
    }
    if metrics.is_empty() {
        return disconnected;
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

/// Claude Code statusLine 훅이 남긴 최신 스풀 파일을 읽는다.
pub fn read_usage() -> UsageInfo {
    let disconnected = UsageInfo::disconnected("claude-code", "Claude Code");
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
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

    let mut status_line = serde_json::Map::new();
    status_line.insert("type".into(), serde_json::json!("command"));
    status_line.insert("command".into(), serde_json::json!(script_path));
    if let Some(delegate) = delegate {
        status_line.insert("aiworkspaceDelegate".into(), serde_json::json!(delegate));
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
        "#!/usr/bin/env bash\nIN=$(cat)\nSPOOL={spool}\nprintf '%s' \"$IN\" > \"$SPOOL\"\nDELEGATE={delegate}\nif [ -n \"$DELEGATE\" ]; then\n  printf '%s' \"$IN\" | \"$DELEGATE\"\nfi\n"
    )
}

/// ~/.claude에 스풀 스크립트를 쓰고 settings.json을 갱신한다.
pub fn install_statusline() -> Result<(), String> {
    let home = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .ok_or("HOME 환경변수 없음")?;
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
    std::fs::write(settings_path, merged).map_err(|error| error.to_string())
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
        let existing =
            r#"{"statusLine":{"type":"command","command":"/old/hud.sh"},"theme":"dark"}"#;
        let output = merge_statusline(existing, "/path/spool.sh").unwrap();

        assert!(output.contains("\"aiworkspaceDelegate\": \"/old/hud.sh\""));
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
        assert!(output.contains("printf '%s' \"$IN\" > \"$SPOOL\""));
        assert!(output.contains("printf '%s' \"$IN\" | \"$DELEGATE\""));
    }
}
