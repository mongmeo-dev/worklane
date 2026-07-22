use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::{UsageInfo, UsageMetric};

#[derive(Debug, Clone, Deserialize)]
pub struct Window {
    #[serde(default)]
    pub used_percent: f32,
    #[serde(default)]
    pub window_minutes: Option<u64>,
    #[serde(default)]
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RateLimits {
    #[serde(default)]
    pub primary: Option<Window>,
    #[serde(default)]
    pub secondary: Option<Window>,
    #[serde(default)]
    pub plan_type: Option<String>,
}

#[derive(Deserialize)]
struct Line {
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

/// JSONL 문자열에서 마지막 token_count의 non-null rate_limits를 반환한다.
pub fn last_rate_limits(jsonl: &str) -> Option<RateLimits> {
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
            found = Some(rate_limits);
        }
    }

    found
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

/// 최신 Codex 세션부터 사용량 한도가 있는 파일을 찾아 읽는다.
pub fn read_usage() -> UsageInfo {
    let disconnected = UsageInfo::disconnected("codex", "Codex CLI");
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return disconnected;
    };
    let root = home.join(".codex").join("sessions");
    if !root.exists() {
        return disconnected;
    }

    let mut files = Vec::new();
    collect_rollouts(&root, &mut files);
    files.sort_by(|left, right| right.0.cmp(&left.0));

    for (_, path) in files.iter().take(50) {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Some(rate_limits) = last_rate_limits(&content) {
                return to_usage_info(rate_limits);
            }
        }
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
