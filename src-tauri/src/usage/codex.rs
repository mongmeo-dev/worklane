use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::{home_dir, UsageInfo, UsageMetric};

#[derive(Debug, Clone, Deserialize)]
pub struct Window {
    #[serde(default)]
    #[serde(alias = "usedPercent")]
    pub used_percent: f32,
    #[serde(default)]
    #[serde(alias = "windowDurationMins")]
    pub window_minutes: Option<u64>,
    #[serde(default)]
    #[serde(alias = "resetsAt")]
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RateLimits {
    #[serde(default)]
    pub primary: Option<Window>,
    #[serde(default)]
    pub secondary: Option<Window>,
    #[serde(default)]
    #[serde(alias = "planType")]
    pub plan_type: Option<String>,
}

#[derive(Deserialize)]
struct Line {
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    payload: Option<Payload>,
}

#[derive(Deserialize)]
struct Payload {
    #[serde(default, rename = "type")]
    kind: Option<String>,
    #[serde(default)]
    rate_limits: Option<RateLimits>,
}

struct RateLimitSnapshot {
    timestamp: Option<String>,
    rate_limits: RateLimits,
}

fn last_rate_limit_snapshot(jsonl: &str) -> Option<RateLimitSnapshot> {
    let mut found = None;

    for line in jsonl.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let Ok(parsed) = serde_json::from_str::<Line>(line) else {
            continue;
        };
        let Some(payload) = parsed.payload else {
            continue;
        };
        if payload.kind.as_deref() != Some("token_count") {
            continue;
        }
        if let Some(rate_limits) = payload.rate_limits {
            found = Some(RateLimitSnapshot {
                timestamp: parsed.timestamp,
                rate_limits,
            });
        }
    }

    found
}

fn update_latest_snapshot(latest: &mut Option<RateLimitSnapshot>, candidate: RateLimitSnapshot) {
    let is_newer = match (candidate.timestamp.as_deref(), latest.as_ref()) {
        (_, None) => true,
        (Some(candidate_time), Some(current)) => current
            .timestamp
            .as_deref()
            .is_none_or(|current_time| candidate_time > current_time),
        (None, Some(_)) => false,
    };
    if is_newer {
        *latest = Some(candidate);
    }
}

/// JSONL 문자열에서 마지막 token_count의 non-null rate_limits를 반환한다.
#[cfg(test)]
pub fn last_rate_limits(jsonl: &str) -> Option<RateLimits> {
    last_rate_limit_snapshot(jsonl).map(|snapshot| snapshot.rate_limits)
}

/// Codex rate_limits를 화면 표시용 공통 사용량 모델로 변환한다.
pub fn to_usage_info(rate_limits: RateLimits) -> UsageInfo {
    let mut metrics = Vec::new();
    let mut primary_percent = None;
    let mut primary_reset = None;

    if let Some(primary) = &rate_limits.primary {
        primary_percent = Some(primary.used_percent);
        primary_reset = primary.resets_at.map(format_reset);
        metrics.push(metric_from_window(primary));
    }
    if let Some(secondary) = &rate_limits.secondary {
        metrics.push(metric_from_window(secondary));
    }

    UsageInfo {
        provider: "codex".into(),
        full_name: "Codex CLI".into(),
        plan: rate_limits.plan_type.as_deref().map(plan_label),
        account: None,
        tier: Some("OpenAI 계정".into()),
        primary_percent,
        primary_reset,
        metrics,
        connected: true,
    }
}

fn metric_from_window(window: &Window) -> UsageMetric {
    UsageMetric {
        label: window_label(window.window_minutes),
        percent: window.used_percent,
        value_text: format!("{:.0}%", window.used_percent),
        reset_note: window.resets_at.map(format_reset).unwrap_or_default(),
    }
}

fn plan_label(plan_type: &str) -> String {
    match plan_type {
        "pro" => "Pro",
        "plus" => "Plus",
        "free" => "무료",
        other => other,
    }
    .to_string()
}

fn window_label(minutes: Option<u64>) -> String {
    match minutes {
        Some(value) if value <= 60 => format!("{value}분 한도"),
        Some(value) if value < 1440 => format!("{}시간 한도", value / 60),
        Some(10080) => "주간 한도".into(),
        Some(value) => format!("{}일 한도", value / 1440),
        None => "사용량".into(),
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

fn parse_app_server_rate_limits(response: serde_json::Value) -> Result<RateLimits, String> {
    if let Some(error) = response.get("error") {
        return Err(format!("Codex app-server 오류: {error}"));
    }
    let rate_limits = response
        .get("result")
        .and_then(|result| result.get("rateLimits"))
        .cloned()
        .ok_or("Codex app-server 응답에 rateLimits가 없음")?;
    serde_json::from_value(rate_limits).map_err(|error| error.to_string())
}

fn write_rpc(stdin: &mut impl std::io::Write, message: serde_json::Value) -> Result<(), String> {
    serde_json::to_writer(&mut *stdin, &message).map_err(|error| error.to_string())?;
    stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

fn receive_rpc(
    receiver: &std::sync::mpsc::Receiver<serde_json::Value>,
    id: i64,
) -> Result<serde_json::Value, String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        let message = receiver
            .recv_timeout(remaining)
            .map_err(|_| "Codex app-server 응답 시간 초과".to_string())?;
        if message.get("id").and_then(serde_json::Value::as_i64) == Some(id) {
            return Ok(message);
        }
    }
}

fn read_app_server_usage(executable: &std::ffi::OsStr) -> Result<UsageInfo, String> {
    use std::io::BufRead;
    use std::process::{Command, Stdio};

    let mut child = Command::new(executable)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let result = (|| {
        let mut stdin = child.stdin.take().ok_or("Codex app-server stdin 없음")?;
        let stdout = child.stdout.take().ok_or("Codex app-server stdout 없음")?;
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for line in std::io::BufReader::new(stdout)
                .lines()
                .map_while(Result::ok)
            {
                if let Ok(message) = serde_json::from_str(&line) {
                    if sender.send(message).is_err() {
                        break;
                    }
                }
            }
        });

        write_rpc(
            &mut stdin,
            serde_json::json!({
                "method": "initialize",
                "id": 1,
                "params": {
                    "clientInfo": {
                        "name": "worklane",
                        "title": "Worklane",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }
            }),
        )?;
        let initialized = receive_rpc(&receiver, 1)?;
        if let Some(error) = initialized.get("error") {
            return Err(format!("Codex app-server 초기화 오류: {error}"));
        }

        write_rpc(
            &mut stdin,
            serde_json::json!({"method": "initialized", "params": {}}),
        )?;
        write_rpc(
            &mut stdin,
            serde_json::json!({"method": "account/rateLimits/read", "id": 2}),
        )?;
        parse_app_server_rate_limits(receive_rpc(&receiver, 2)?).map(to_usage_info)
    })();

    let _ = child.kill();
    let _ = child.wait();
    result
}

fn read_live_usage() -> Result<UsageInfo, String> {
    let mut candidates = Vec::new();
    if let Some(executable) = std::env::var_os("CODEX_BIN") {
        candidates.push(PathBuf::from(executable));
    }
    candidates.push(PathBuf::from("codex"));
    if let Some(home) = home_dir() {
        candidates.push(home.join(".local").join("bin").join("codex"));
        candidates.push(
            home.join(".local")
                .join("share")
                .join("mise")
                .join("shims")
                .join("codex"),
        );
    }

    let mut last_error = "Codex 실행 파일 없음".to_string();
    for executable in candidates {
        match read_app_server_usage(executable.as_os_str()) {
            Ok(usage) => return Ok(usage),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

/// Codex app-server에서 최신 한도를 조회하고, 실패하면 최근 로컬 이벤트로 폴백한다.
pub fn read_usage() -> UsageInfo {
    if let Ok(usage) = read_live_usage() {
        return usage;
    }
    let disconnected = UsageInfo::disconnected("codex", "Codex CLI");
    let Some(home) = home_dir() else {
        return disconnected;
    };
    let root = home.join(".codex").join("sessions");
    if !root.exists() {
        return disconnected;
    }

    let mut files = Vec::new();
    collect_rollouts(&root, &mut files);
    files.sort_by(|left, right| right.0.cmp(&left.0));

    let mut latest = None;
    for (_, path) in files.iter().take(50) {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Some(snapshot) = last_rate_limit_snapshot(&content) {
                update_latest_snapshot(&mut latest, snapshot);
            }
        }
    }
    if let Some(snapshot) = latest {
        return to_usage_info(snapshot.rate_limits);
    }

    disconnected
}

fn collect_rollouts(dir: &Path, out: &mut Vec<(std::time::SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_rollouts(&path, out);
            continue;
        }
        let is_rollout = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("rollout-") && name.ends_with(".jsonl"));
        if is_rollout {
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            out.push((modified, path));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":42.0,"window_minutes":300,"resets_at":1785113499},"secondary":null,"plan_type":"pro"}}}"#;

    #[test]
    fn 마지막_nonnull_rate_limits를_찾는다() {
        let jsonl = format!(
            "{{\"payload\":{{\"type\":\"token_count\",\"rate_limits\":{{\"primary\":{{\"used_percent\":12.0}}}}}}}}\n{SAMPLE}\n{{\"payload\":{{\"type\":\"token_count\",\"rate_limits\":null}}}}\n"
        );

        let limits = last_rate_limits(&jsonl).unwrap();

        assert_eq!(limits.primary.as_ref().unwrap().used_percent, 42.0);
        assert_eq!(limits.plan_type.as_deref(), Some("pro"));
    }

    #[test]
    fn app_server의_camel_case_응답을_사용량으로_변환한다() {
        let limits = parse_app_server_rate_limits(serde_json::json!({
            "id": 2,
            "result": {
                "rateLimits": {
                    "primary": {
                        "usedPercent": 33.0,
                        "windowDurationMins": 10080,
                        "resetsAt": 1785287819
                    },
                    "secondary": null,
                    "planType": "pro"
                }
            }
        }))
        .unwrap();
        let info = to_usage_info(limits);

        assert_eq!(info.primary_percent, Some(33.0));
        assert_eq!(info.metrics[0].label, "주간 한도");
        assert_eq!(info.plan.as_deref(), Some("Pro"));
    }

    #[test]
    fn 여러_세션에서는_파일순서가_아닌_이벤트시각으로_최신값을_고른다() {
        let newer = last_rate_limit_snapshot(
            r#"{"timestamp":"2026-07-23T09:30:00Z","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":26.0}}}}"#,
        )
        .unwrap();
        let older = last_rate_limit_snapshot(
            r#"{"timestamp":"2026-07-23T09:20:00Z","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":21.0}}}}"#,
        )
        .unwrap();
        let mut latest = None;

        update_latest_snapshot(&mut latest, newer);
        update_latest_snapshot(&mut latest, older);

        assert_eq!(
            latest.unwrap().rate_limits.primary.unwrap().used_percent,
            26.0
        );
    }

    #[test]
    fn rate_limits가_없으면_none을_반환한다() {
        assert!(last_rate_limits("{}\n{\"a\":1}\n").is_none());
    }

    #[test]
    fn token_count가_아닌_payload는_무시한다() {
        let jsonl =
            r#"{"payload":{"type":"message","rate_limits":{"primary":{"used_percent":99.0}}}}"#;

        assert!(last_rate_limits(jsonl).is_none());
    }

    #[test]
    fn usage_info에_percent와_plan을_반영한다() {
        let limits = last_rate_limits(SAMPLE).unwrap();
        let info = to_usage_info(limits);

        assert_eq!(info.provider, "codex");
        assert_eq!(info.primary_percent, Some(42.0));
        assert_eq!(info.plan.as_deref(), Some("Pro"));
        assert!(info.connected);
    }
}
