use std::path::PathBuf;

use serde::Serialize;

pub mod claude;
pub mod codex;

/// 플랫폼별 홈 디렉터리 환경변수를 공통 경로로 변환한다.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetric {
    pub label: String,
    pub percent: f32,
    pub value_text: String,
    pub reset_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub provider: String,
    pub full_name: String,
    pub plan: Option<String>,
    pub account: Option<String>,
    pub tier: Option<String>,
    pub primary_percent: Option<f32>,
    pub primary_reset: Option<String>,
    pub metrics: Vec<UsageMetric>,
    pub connected: bool,
}

impl UsageInfo {
    /// 로컬 사용량 데이터가 아직 연결되지 않은 기본 상태를 만든다.
    pub fn disconnected(provider: &str, full_name: &str) -> Self {
        Self {
            provider: provider.into(),
            full_name: full_name.into(),
            plan: None,
            account: None,
            tier: None,
            primary_percent: None,
            primary_reset: None,
            metrics: Vec::new(),
            connected: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 미연동_사용량은_빈_지표를_반환한다() {
        let info = UsageInfo::disconnected("codex", "Codex CLI");

        assert_eq!(info.provider, "codex");
        assert_eq!(info.full_name, "Codex CLI");
        assert!(!info.connected);
        assert!(info.metrics.is_empty());
    }
}
