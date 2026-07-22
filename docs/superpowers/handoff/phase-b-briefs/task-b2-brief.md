## Task B2: Codex 사용량 파서

**Files:**
- Create: `src-tauri/src/usage/mod.rs`
- Create: `src-tauri/src/usage/codex.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`
- Create: `src/lib/ipc/usage.ts`

**Interfaces:**
- Produces (IPC): `read_codex_usage() -> UsageInfo`. UsageInfo는 마스터 계약과 일치.
- 파일 소스: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` 안 `payload.type == "token_count"`의 `rate_limits`. **최신 파일부터 역순으로 스캔해 마지막 non-null `rate_limits`를 찾는다**(최신 세션이 null일 수 있음).

- [ ] **Step 1: UsageInfo 공통 타입 정의**

`src-tauri/src/usage/mod.rs`:

```rust
use serde::Serialize;

pub mod codex;

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
    pub provider: String,        // "codex" | "claude-code" ...
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
    /// 연동 안 됨(데이터 없음) 기본값.
    pub fn disconnected(provider: &str, full_name: &str) -> Self {
        UsageInfo {
            provider: provider.into(), full_name: full_name.into(),
            plan: None, account: None, tier: None,
            primary_percent: None, primary_reset: None,
            metrics: vec![], connected: false,
        }
    }
}
```

- [ ] **Step 2: Codex 파서 테스트 작성**

`src-tauri/src/usage/codex.rs`에 순수 파싱 함수 `parse_rate_limits(jsonl: &str) -> Option<RateLimits>`를 만들고 테스트한다:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":42.0,"window_minutes":300,"resets_at":1785113499},"secondary":null,"plan_type":"pro"}}}"#;

    #[test]
    fn 마지막_nonnull_rate_limits를_찾는다() {
        // 앞줄은 null, 뒷줄은 값 → 뒷줄 채택
        let jsonl = format!(
            "{{\"payload\":{{\"type\":\"token_count\",\"rate_limits\":null}}}}\n{SAMPLE}\n"
        );
        let rl = last_rate_limits(&jsonl).unwrap();
        assert_eq!(rl.primary.as_ref().unwrap().used_percent, 42.0);
        assert_eq!(rl.plan_type.as_deref(), Some("pro"));
    }

    #[test]
    fn rate_limits_없으면_none() {
        assert!(last_rate_limits("{}\n{\"a\":1}\n").is_none());
    }

    #[test]
    fn usage_info_변환_percent와_plan_반영() {
        let rl = last_rate_limits(SAMPLE).unwrap();
        let info = to_usage_info(rl);
        assert_eq!(info.provider, "codex");
        assert_eq!(info.primary_percent, Some(42.0));
        assert_eq!(info.plan.as_deref(), Some("Pro"));
        assert!(info.connected);
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd src-tauri && cargo test usage::codex`
Expected: FAIL — 함수 없음.

- [ ] **Step 4: Codex 파서 구현**

`src-tauri/src/usage/codex.rs` (상단):

```rust
use serde::Deserialize;
use super::{UsageInfo, UsageMetric};

#[derive(Debug, Clone, Deserialize)]
pub struct Window {
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
    payload: Option<Payload>,
}
#[derive(Deserialize)]
struct Payload {
    #[serde(default)]
    rate_limits: Option<RateLimits>,
}

/// jsonl 문자열에서 마지막 non-null rate_limits를 반환.
pub fn last_rate_limits(jsonl: &str) -> Option<RateLimits> {
    let mut found = None;
    for line in jsonl.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if let Ok(parsed) = serde_json::from_str::<Line>(line) {
            if let Some(rl) = parsed.payload.and_then(|p| p.rate_limits) {
                found = Some(rl);
            }
        }
    }
    found
}

/// plan_type 소문자 → 표시용 라벨.
fn plan_label(pt: &str) -> String {
    match pt {
        "pro" => "Pro",
        "plus" => "Plus",
        "free" => "무료",
        other => other,
    }.to_string()
}

pub fn to_usage_info(rl: RateLimits) -> UsageInfo {
    let mut metrics = Vec::new();
    let mut primary_percent = None;
    let mut primary_reset = None;
    if let Some(p) = &rl.primary {
        primary_percent = Some(p.used_percent);
        primary_reset = p.resets_at.map(fmt_reset);
        metrics.push(UsageMetric {
            label: window_label(p.window_minutes),
            percent: p.used_percent,
            value_text: format!("{:.0}%", p.used_percent),
            reset_note: p.resets_at.map(fmt_reset).unwrap_or_default(),
        });
    }
    if let Some(s) = &rl.secondary {
        metrics.push(UsageMetric {
            label: window_label(s.window_minutes),
            percent: s.used_percent,
            value_text: format!("{:.0}%", s.used_percent),
            reset_note: s.resets_at.map(fmt_reset).unwrap_or_default(),
        });
    }
    UsageInfo {
        provider: "codex".into(),
        full_name: "Codex CLI".into(),
        plan: rl.plan_type.as_deref().map(plan_label),
        account: None,
        tier: Some("OpenAI 계정".into()),
        primary_percent,
        primary_reset,
        metrics,
        connected: true,
    }
}

/// window_minutes → 사람이 읽는 창 이름.
fn window_label(m: Option<u64>) -> String {
    match m {
        Some(x) if x <= 60 => format!("{}분 한도", x),
        Some(x) if x < 1440 => format!("{}시간 한도", x / 60),
        Some(x) if x == 10080 => "주간 한도".into(),
        Some(x) => format!("{}일 한도", x / 1440),
        None => "사용량".into(),
    }
}

/// epoch(초) → "N시간 후 초기화" 근사. 과거면 "초기화됨".
/// now는 SystemTime 기준. 테스트는 fmt_reset를 직접 부르지 않고 to_usage_info 경로만 검증.
fn fmt_reset(epoch: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let diff = epoch - now;
    if diff <= 0 { return "곧 초기화".into(); }
    let h = diff / 3600;
    if h >= 24 { format!("{}일 후 초기화", h / 24) }
    else if h >= 1 { format!("{}시간 후 초기화", h) }
    else { format!("{}분 후 초기화", diff / 60) }
}
```

> 주의: 테스트에서 `used_percent`가 42.0으로 나오려면 SAMPLE의 값이 42.0이어야 한다(위 SAMPLE 참조). `fmt_reset`은 현재시각 의존이라 값 자체는 assert하지 않는다.

- [ ] **Step 5: 파일 스캔 함수 추가**

`codex.rs`에 디렉토리 스캔 추가(테스트는 파서 중심, 스캔은 통합):

```rust
use std::path::PathBuf;

/// ~/.codex/sessions 하위의 rollout-*.jsonl을 최신 수정순으로 스캔해
/// 처음으로 non-null rate_limits를 얻으면 UsageInfo로 변환.
pub fn read_usage() -> UsageInfo {
    let disc = UsageInfo::disconnected("codex", "Codex CLI");
    let Some(home) = dirs_home() else { return disc };
    let root = home.join(".codex").join("sessions");
    if !root.exists() { return disc; }

    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    collect_rollouts(&root, &mut files);
    files.sort_by(|a, b| b.0.cmp(&a.0)); // 최신 먼저

    for (_, path) in files.iter().take(50) { // 과도한 스캔 방지 상한
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Some(rl) = last_rate_limits(&content) {
                return to_usage_info(rl);
            }
        }
    }
    disc
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn collect_rollouts(dir: &std::path::Path, out: &mut Vec<(std::time::SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_rollouts(&p, out);
        } else if p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("rollout-") && n.ends_with(".jsonl")).unwrap_or(false) {
            let mtime = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            out.push((mtime, p));
        }
    }
}
```

- [ ] **Step 6: 명령 등록 + IPC 래퍼**

`lib.rs`: `mod usage;` 추가, `invoke_handler`에 `commands::read_codex_usage,` 추가.

`commands.rs`:

```rust
#[tauri::command]
pub async fn read_codex_usage() -> Result<crate::usage::UsageInfo, String> {
    tauri::async_runtime::spawn_blocking(crate::usage::codex::read_usage)
        .await
        .map_err(|e| e.to_string())
}
```

`src/lib/ipc/usage.ts` 생성(마스터 계약의 UsageInfo/UsageMetric 타입 + `readCodexUsage`, 이후 Task B3에서 `readClaudeUsage`/`installClaudeStatusline` 추가):

```ts
import { invoke } from "@tauri-apps/api/core";

export type UsageProvider = "claude-code" | "codex" | "cursor" | "gemini";

export interface UsageMetric { label: string; percent: number; valueText: string; resetNote: string; }
export interface UsageInfo {
  provider: UsageProvider;
  fullName: string;
  plan: string | null;
  account: string | null;
  tier: string | null;
  primaryPercent: number | null;
  primaryReset: string | null;
  metrics: UsageMetric[];
  connected: boolean;
}

export function readCodexUsage(): Promise<UsageInfo> {
  return invoke<UsageInfo>("read_codex_usage");
}

/** cursor/gemini는 로컬 소스 부재 — 프론트에서 연동 안 됨 정보 생성. */
export function disconnectedUsage(provider: UsageProvider, fullName: string, tier: string): UsageInfo {
  return { provider, fullName, plan: null, account: null, tier,
    primaryPercent: null, primaryReset: null, metrics: [], connected: false };
}
```

- [ ] **Step 7: 테스트/빌드**

Run: `cd src-tauri && cargo test usage`
Expected: PASS. `pnpm check`도 통과.

- [ ] **Step 8: 커밋**

```bash
git add src-tauri/src/usage src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/usage.ts
git commit -m "feat: Codex 로컬 세션에서 사용량 한도 파싱 명령 추가"
```

---

