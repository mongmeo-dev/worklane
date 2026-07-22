# Phase B: 백엔드 (사용량·시스템·파일·공유 worktree)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> 마스터 계획: `2026-07-22-main-screen-redesign-master.md` — Global Constraints 준수. IPC 시그니처는 마스터의 "B가 제공" 계약과 일치해야 한다.

**Goal:** 하단 상태 바(사용량·CPU/RAM), 파일 패널/에디터, 공유 worktree에 필요한 Rust 백엔드 명령을 구현한다.

**의존:** 없음. **후행:** Phase D(파일), E(사용량/시스템)가 소비.

## Global Constraints (상속)

- 커밋: 기능 단위, 한글 메시지, Co-Author 없음, `[ci skip]` 미사용.
- 새 명령은 `commands.rs`에 추가하고 `lib.rs`의 `invoke_handler`에 등록.
- 블로킹 IO(git/파일)는 기존 패턴대로 `spawn_blocking` 또는 동기 명령으로. Mutex는 짧게 잡고 IO 중 보유 금지(기존 delete_project 패턴 참고).
- 경로 이스케이프(worktree 밖 접근) 방지 필수.
- 검증: `cd src-tauri && cargo test` (또는 `mise exec -- cargo test`).

---

## Task B1: 시스템 리소스 (CPU/RAM)

**Files:**
- Modify: `src-tauri/Cargo.toml` (sysinfo 추가)
- Create: `src-tauri/src/system/mod.rs`
- Modify: `src-tauri/src/lib.rs` (mod system; 명령 등록)
- Modify: `src-tauri/src/commands.rs` (read_system_resources)
- Create: `src/lib/ipc/system.ts`

**Interfaces:**
- Produces (IPC): `read_system_resources() -> { cpuPercent, ramUsedGb, ramTotalGb }`.

- [ ] **Step 1: sysinfo 의존성 추가**

`src-tauri/Cargo.toml`의 `[dependencies]`에 추가:

```toml
sysinfo = "0.32"
```

Run: `cd src-tauri && cargo build`
Expected: sysinfo 컴파일 성공.

- [ ] **Step 2: 시스템 모듈 + 테스트 작성**

`src-tauri/src/system/mod.rs` 생성:

```rust
use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

/// 현재 CPU 사용률(전체 평균 %)과 RAM 사용/총량(GB)을 읽는다.
/// CPU는 두 번 refresh 사이 간격이 필요하므로 짧게 대기 후 측정한다.
pub fn read_resources() -> SystemResources {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let used = sys.used_memory() as f32 / 1_073_741_824.0; // bytes → GiB
    let total = sys.total_memory() as f32 / 1_073_741_824.0;
    SystemResources {
        cpu_percent,
        ram_used_gb: (used * 10.0).round() / 10.0,
        ram_total_gb: (total).round(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 리소스는_유효_범위를_반환한다() {
        let r = read_resources();
        assert!(r.cpu_percent >= 0.0 && r.cpu_percent <= 100.0 * num_cpus_upper());
        assert!(r.ram_total_gb > 0.0);
        assert!(r.ram_used_gb >= 0.0 && r.ram_used_gb <= r.ram_total_gb + 1.0);
    }
    // global_cpu_usage는 0~100 정규화값이므로 상한 100으로 본다.
    fn num_cpus_upper() -> f32 { 1.0 }
}
```

- [ ] **Step 3: 테스트 실행(실패→성공)**

Run: `cd src-tauri && cargo test system::`
Expected: PASS. (mod 등록 전이면 컴파일 실패 → Step 4 후 재실행.)

- [ ] **Step 4: lib.rs에 mod + 명령 등록, commands.rs에 명령 추가**

`src-tauri/src/lib.rs` 상단 mod 목록에 `mod system;` 추가. `invoke_handler` 배열에 `commands::read_system_resources,` 추가.

`src-tauri/src/commands.rs`에 추가:

```rust
#[tauri::command]
pub async fn read_system_resources() -> Result<crate::system::SystemResources, String> {
    tauri::async_runtime::spawn_blocking(crate::system::read_resources)
        .await
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5: 테스트/빌드 확인**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS.

- [ ] **Step 6: 프론트 IPC 래퍼**

`src/lib/ipc/system.ts` 생성:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface SystemResources {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

export function readSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>("read_system_resources");
}
```

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/system/mod.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/system.ts
git commit -m "feat: 시스템 리소스(CPU/RAM) 조회 명령 추가"
```

---

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

## Task B3: Claude Code statusLine 훅 설치 + 사용량 읽기

**Files:**
- Create: `src-tauri/src/usage/claude.rs`
- Modify: `src-tauri/src/usage/mod.rs`, `lib.rs`, `commands.rs`, `src/lib/ipc/usage.ts`

**Interfaces:**
- Produces: `install_claude_statusline()`, `read_claude_usage() -> UsageInfo`.
- **설계**: 앱이 `~/.claude/settings.json`의 `statusLine.command`에 스풀 스크립트를 설치한다. 스크립트는 stdin(JSON)을 받아 `~/.claude/aiworkspace-usage.json`에 저장하고, **기존 command가 있었다면 그 값을 stdin과 함께 위임 실행**해 기존 statusLine 기능을 깨지 않는다. `read_claude_usage`는 그 스풀 파일에서 `rate_limits.five_hour`/`.seven_day`를 읽는다.

- [ ] **Step 1: 스풀 파서 테스트**

`src-tauri/src/usage/claude.rs`에 `parse_spool(json: &str) -> UsageInfo`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SPOOL: &str = r#"{"rate_limits":{"five_hour":{"used_percentage":62,"resets_at":"3시간 후"},"seven_day":{"used_percentage":41,"resets_at":"월요일"}}}"#;

    #[test]
    fn 스풀에서_5시간_주간_퍼센트를_읽는다() {
        let info = parse_spool(SPOOL);
        assert!(info.connected);
        assert_eq!(info.primary_percent, Some(62.0));
        assert_eq!(info.metrics.len(), 2);
        assert_eq!(info.metrics[0].percent, 62.0);
        assert_eq!(info.metrics[1].percent, 41.0);
    }

    #[test]
    fn rate_limits_없으면_연동_대기() {
        let info = parse_spool("{}");
        assert!(!info.connected);
    }
}
```

- [ ] **Step 2: 실패 확인 → 파서 구현**

Run: `cd src-tauri && cargo test usage::claude` → FAIL.

`claude.rs` 상단:

```rust
use serde::Deserialize;
use super::{UsageInfo, UsageMetric};

#[derive(Deserialize)]
struct Spool { rate_limits: Option<RateLimits> }
#[derive(Deserialize)]
struct RateLimits {
    #[serde(default)] five_hour: Option<Window>,
    #[serde(default)] seven_day: Option<Window>,
}
#[derive(Deserialize)]
struct Window {
    used_percentage: f32,
    #[serde(default)] resets_at: Option<String>,
}

pub fn parse_spool(json: &str) -> UsageInfo {
    let disc = UsageInfo::disconnected("claude-code", "Claude Code");
    let Ok(sp) = serde_json::from_str::<Spool>(json) else { return disc };
    let Some(rl) = sp.rate_limits else { return disc };
    let mut metrics = Vec::new();
    let mut primary = None;
    if let Some(w) = &rl.five_hour {
        primary = Some(w.used_percentage);
        metrics.push(UsageMetric {
            label: "세션 한도 (5시간)".into(), percent: w.used_percentage,
            value_text: format!("{:.0}%", w.used_percentage),
            reset_note: w.resets_at.clone().unwrap_or_default(),
        });
    }
    if let Some(w) = &rl.seven_day {
        metrics.push(UsageMetric {
            label: "주간 한도".into(), percent: w.used_percentage,
            value_text: format!("{:.0}%", w.used_percentage),
            reset_note: w.resets_at.clone().unwrap_or_default(),
        });
    }
    if metrics.is_empty() { return disc; }
    UsageInfo {
        provider: "claude-code".into(), full_name: "Claude Code".into(),
        plan: None, account: None, tier: Some("Anthropic 계정".into()),
        primary_percent: primary,
        primary_reset: rl.five_hour.and_then(|w| w.resets_at),
        metrics, connected: true,
    }
}

pub fn read_usage() -> UsageInfo {
    let disc = UsageInfo::disconnected("claude-code", "Claude Code");
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else { return disc };
    let spool = home.join(".claude").join("aiworkspace-usage.json");
    match std::fs::read_to_string(&spool) {
        Ok(c) => parse_spool(&c),
        Err(_) => disc,
    }
}
```

Run: `cd src-tauri && cargo test usage::claude` → PASS.

- [ ] **Step 3: statusLine 훅 설치 함수 + 테스트**

`claude.rs`에 설치 로직. 기존 settings.json을 보존하며 `statusLine.command`만 우리 스크립트로 교체(원래 command는 스크립트가 위임하도록 스크립트 내부에 기록). 테스트는 "기존 설정 병합" 순수 함수 `merge_statusline(existing_json, script_path) -> new_json`으로 검증:

```rust
// 순수 병합 함수
pub fn merge_statusline(existing: &str, script_path: &str) -> Result<String, String> {
    let mut root: serde_json::Value =
        if existing.trim().is_empty() { serde_json::json!({}) }
        else { serde_json::from_str(existing).map_err(|e| e.to_string())? };
    let obj = root.as_object_mut().ok_or("settings.json 최상위가 객체가 아님")?;
    // 기존 statusLine.command 보존
    let prev = obj.get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string());
    let mut sl = serde_json::Map::new();
    sl.insert("type".into(), serde_json::json!("command"));
    sl.insert("command".into(), serde_json::json!(script_path));
    if let Some(p) = prev {
        // 우리 스크립트가 아닌 경우에만 위임 대상으로 기록
        if p != script_path {
            sl.insert("aiworkspaceDelegate".into(), serde_json::json!(p));
        }
    }
    obj.insert("statusLine".into(), serde_json::Value::Object(sl));
    serde_json::to_string_pretty(&root).map_err(|e| e.to_string())
}

#[cfg(test)]
mod merge_tests {
    use super::*;
    #[test]
    fn 빈_설정에_statusline_추가() {
        let out = merge_statusline("", "/path/spool.sh").unwrap();
        assert!(out.contains("\"command\": \"/path/spool.sh\""));
    }
    #[test]
    fn 기존_command를_위임으로_보존() {
        let existing = r#"{"statusLine":{"type":"command","command":"/old/hud.sh"},"theme":"dark"}"#;
        let out = merge_statusline(existing, "/path/spool.sh").unwrap();
        assert!(out.contains("aiworkspaceDelegate"));
        assert!(out.contains("/old/hud.sh"));
        assert!(out.contains("\"theme\": \"dark\"")); // 다른 설정 보존
    }
}
```

- [ ] **Step 4: 설치 실행 함수(파일/스크립트 쓰기)**

`claude.rs`에 추가. 스풀 스크립트는 stdin을 파일로 저장하고, 위임 대상이 있으면 stdin을 넘겨 실행:

```rust
/// ~/.claude에 스풀 스크립트를 쓰고 settings.json을 갱신한다.
pub fn install_statusline() -> Result<(), String> {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from)
        .ok_or("HOME 환경변수 없음")?;
    let dir = home.join(".claude");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let script = dir.join("aiworkspace-statusline.sh");
    let spool = dir.join("aiworkspace-usage.json");
    // stdin을 스풀 파일로 저장. 위임 대상($1)이 있으면 같은 stdin으로 실행.
    let body = format!(
        "#!/usr/bin/env bash\nIN=$(cat)\nprintf '%s' \"$IN\" > {spool:?}\nDELEGATE={{delegate}}\nif [ -n \"$DELEGATE\" ]; then printf '%s' \"$IN\" | \"$DELEGATE\"; fi\n"
    );
    // 위임 경로는 settings.json에서 읽어 스크립트에 주입하지 않고, 스크립트가 실행 시
    // settings.json의 aiworkspaceDelegate를 참조하도록 단순화하거나, 설치 시점에 확정.
    // 여기서는 설치 시점 위임 경로를 스크립트에 하드코딩(단순/안전).
    let settings_path = dir.join("settings.json");
    let existing = std::fs::read_to_string(&settings_path).unwrap_or_default();
    let script_str = script.to_string_lossy().to_string();
    let merged = merge_statusline(&existing, &script_str)?;
    // 위임 경로 추출
    let delegate = serde_json::from_str::<serde_json::Value>(&merged).ok()
        .and_then(|v| v.get("statusLine").and_then(|s| s.get("aiworkspaceDelegate")).and_then(|d| d.as_str()).map(String::from))
        .unwrap_or_default();
    let body = body.replace("{{delegate}}", &format!("{:?}", delegate));

    std::fs::write(&script, body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perm = std::fs::metadata(&script).map_err(|e| e.to_string())?.permissions();
        perm.set_mode(0o755);
        std::fs::set_permissions(&script, perm).map_err(|e| e.to_string())?;
    }
    std::fs::write(&settings_path, merged).map_err(|e| e.to_string())?;
    Ok(())
}
```

> 구현 주의: 위 `body` 포맷의 이스케이프는 실제 구현 시 검증 필요(bash 스크립트 문자열). 핵심은 (1) stdin→spool 저장, (2) 위임 실행, (3) 실행 권한. TDD 대상은 `merge_statusline`이며, 파일 쓰기는 통합 확인.

- [ ] **Step 5: 명령 등록 + IPC**

`lib.rs` invoke_handler에 `commands::read_claude_usage, commands::install_claude_statusline,` 추가.

`commands.rs`:

```rust
#[tauri::command]
pub async fn read_claude_usage() -> Result<crate::usage::UsageInfo, String> {
    tauri::async_runtime::spawn_blocking(crate::usage::claude::read_usage)
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_claude_statusline() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::usage::claude::install_statusline)
        .await.map_err(|e| e.to_string())?
}
```

`mod.rs`에 `pub mod claude;` 추가.

`src/lib/ipc/usage.ts`에 추가:

```ts
export function readClaudeUsage(): Promise<UsageInfo> {
  return invoke<UsageInfo>("read_claude_usage");
}
export function installClaudeStatusline(): Promise<void> {
  return invoke("install_claude_statusline");
}
```

- [ ] **Step 6: 테스트/커밋**

Run: `cd src-tauri && cargo test usage::claude`
Expected: PASS (병합 2 + 파서 2).

```bash
git add src-tauri/src/usage src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/usage.ts
git commit -m "feat: Claude Code statusLine 훅 설치 및 스풀 사용량 읽기 명령 추가"
```

---

## Task B4: 파일 트리 / 파일 읽기 / 파일별 diff

**Files:**
- Modify: `src-tauri/src/git/mod.rs` (파일 목록/diff 추가)
- Create: `src-tauri/src/files/mod.rs` (파일 읽기 + 경로 안전)
- Modify: `lib.rs`, `commands.rs`
- Create: `src/lib/ipc/files.ts`

**Interfaces:** 마스터 계약의 `FileEntry`/`FileContent`/`DiffLine` + 3개 함수.

- [ ] **Step 1: 파일 목록 로직 테스트 (git/mod.rs)**

worktree의 변경 상태를 `git status --porcelain`으로 파싱하는 순수 함수 `parse_status_porcelain(out) -> Vec<(path, FileChange)>`:

```rust
#[cfg(test)]
mod file_tests {
    use super::*;
    #[test]
    fn porcelain_수정_신규_삭제_파싱() {
        let out = " M src/a.rs\n?? src/new.rs\n D src/gone.rs\nA  staged.rs\n";
        let v = parse_status_porcelain(out);
        assert!(v.contains(&("src/a.rs".to_string(), FileChange::Modified)));
        assert!(v.contains(&("src/new.rs".to_string(), FileChange::New)));
        assert!(v.contains(&("src/gone.rs".to_string(), FileChange::Deleted)));
        assert!(v.contains(&("staged.rs".to_string(), FileChange::Modified)));
    }
}
```

`git/mod.rs`에 추가:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChange { None, Modified, New, Deleted }

pub fn parse_status_porcelain(out: &str) -> Vec<(String, FileChange)> {
    let mut v = Vec::new();
    for line in out.lines() {
        if line.len() < 4 { continue; }
        let code = &line[..2];
        let path = line[3..].to_string();
        let change = if code == "??" { FileChange::New }
            else if code.contains('D') { FileChange::Deleted }
            else { FileChange::Modified };
        v.push((path, change));
    }
    v
}
```

Run: `cd src-tauri && cargo test git::file_tests` → PASS (구현 후).

- [ ] **Step 2: FileEntry 목록 명령**

`git/mod.rs`에 `list_files(worktree) -> Vec<FileEntry>`: `git ls-files`(추적 파일) ∪ status(변경) 합쳐 각 파일에 change/add/del 부여. add/del은 `git diff --numstat HEAD` 파싱.

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String, pub dir: String, pub name: String,
    pub change: FileChange, pub add: u32, pub del: u32,
}

pub fn list_files(worktree: &str) -> Result<Vec<FileEntry>, String> {
    let tracked = run_git(worktree, &["ls-files"])?;
    let status = run_git(worktree, &["status", "--porcelain"])?;
    let numstat = run_git(worktree, &["diff", "--numstat", "HEAD"])?;

    let changes: std::collections::HashMap<String, FileChange> =
        parse_status_porcelain(&status).into_iter().collect();
    let stats = parse_numstat(&numstat); // HashMap<path,(add,del)>

    let mut set: std::collections::BTreeSet<String> = tracked.lines().map(|s| s.to_string()).collect();
    for (p, _) in &changes { set.insert(p.clone()); }

    Ok(set.into_iter().map(|path| {
        let (dir, name) = split_path(&path);
        let change = *changes.get(&path).unwrap_or(&FileChange::None);
        let (add, del) = stats.get(&path).copied().unwrap_or((0, 0));
        FileEntry { path, dir, name, change, add, del }
    }).collect())
}

fn parse_numstat(out: &str) -> std::collections::HashMap<String, (u32, u32)> {
    let mut m = std::collections::HashMap::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let add = parts[0].parse().unwrap_or(0);
            let del = parts[1].parse().unwrap_or(0);
            m.insert(parts[2].to_string(), (add, del));
        }
    }
    m
}

fn split_path(path: &str) -> (String, String) {
    match path.rfind('/') {
        Some(i) => (path[..i].to_string(), path[i+1..].to_string()),
        None => ("/".to_string(), path.to_string()),
    }
}
```

`parse_numstat`/`split_path`도 각각 간단 단위테스트 추가(`"5\t3\tsrc/a.rs"` → `("src/a.rs",(5,3))`).

- [ ] **Step 3: 파일 읽기(경로 안전) — files/mod.rs**

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent { pub content: String, pub is_binary: bool }

/// worktree 밖 접근을 막고 파일 내용을 읽는다. 바이너리는 content 빈 문자열.
pub fn read_file(worktree: &str, rel: &str) -> Result<FileContent, String> {
    let base = std::fs::canonicalize(worktree).map_err(|e| e.to_string())?;
    let target = std::fs::canonicalize(base.join(rel)).map_err(|e| e.to_string())?;
    if !target.starts_with(&base) {
        return Err("worktree 밖 경로 접근 거부".into());
    }
    let bytes = std::fs::read(&target).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Ok(FileContent { content: String::new(), is_binary: true });
    }
    Ok(FileContent { content: String::from_utf8_lossy(&bytes).into_owned(), is_binary: false })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn worktree_밖_경로는_거부() {
        let dir = std::env::temp_dir();
        // ../ 탈출 시도는 canonicalize 후 base 밖이 되어 거부되어야 함
        let err = read_file(dir.to_str().unwrap(), "../../etc/passwd");
        assert!(err.is_err());
    }
}
```

- [ ] **Step 4: 파일별 diff 라인**

`git/mod.rs`에 `file_diff_lines(worktree, rel) -> Vec<DiffLine>`: `git diff HEAD -- <rel>`의 unified diff를 파싱해 `@@` 헤더에서 라인번호 추적. 신규 파일은 `--no-index /dev/null` 사용(기존 diff_working_tree 패턴 참고).

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String, // "add"|"del"|"ctx"
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

/// unified diff 한 파일 분량을 DiffLine 배열로 파싱(순수 함수).
pub fn parse_unified_diff(diff: &str) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    let (mut old_no, mut new_no) = (0u32, 0u32);
    for l in diff.lines() {
        if l.starts_with("@@") {
            // @@ -a,b +c,d @@
            if let Some((o, n)) = parse_hunk_header(l) { old_no = o; new_no = n; }
        } else if l.starts_with("+++") || l.starts_with("---") || l.starts_with("diff ") || l.starts_with("index ") || l.starts_with("new file") || l.starts_with("deleted file") {
            continue;
        } else if let Some(rest) = l.strip_prefix('+') {
            lines.push(DiffLine { kind: "add".into(), old_no: None, new_no: Some(new_no), text: rest.to_string() });
            new_no += 1;
        } else if let Some(rest) = l.strip_prefix('-') {
            lines.push(DiffLine { kind: "del".into(), old_no: Some(old_no), new_no: None, text: rest.to_string() });
            old_no += 1;
        } else if let Some(rest) = l.strip_prefix(' ') {
            lines.push(DiffLine { kind: "ctx".into(), old_no: Some(old_no), new_no: Some(new_no), text: rest.to_string() });
            old_no += 1; new_no += 1;
        }
    }
    lines
}

fn parse_hunk_header(l: &str) -> Option<(u32, u32)> {
    // @@ -12,7 +12,8 @@ ...
    let body = l.trim_start_matches('@').trim();
    let mut old = None; let mut new = None;
    for tok in body.split_whitespace() {
        if let Some(s) = tok.strip_prefix('-') { old = s.split(',').next().and_then(|x| x.parse().ok()); }
        if let Some(s) = tok.strip_prefix('+') { new = s.split(',').next().and_then(|x| x.parse().ok()); }
    }
    Some((old?, new?))
}

#[cfg(test)]
mod diff_tests {
    use super::*;
    #[test]
    fn 헌크_추가삭제_라인번호_추적() {
        let d = "@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n";
        let v = parse_unified_diff(d);
        assert_eq!(v[0].kind, "ctx");
        assert_eq!(v[0].old_no, Some(1));
        assert_eq!(v[1].kind, "del");
        assert_eq!(v[1].old_no, Some(2));
        assert_eq!(v[2].kind, "add");
        assert_eq!(v[2].new_no, Some(2));
    }
}
```

그리고 실제 실행 래퍼:

```rust
pub fn file_diff_lines(worktree: &str, rel: &str) -> Result<Vec<DiffLine>, String> {
    let diff = run_git(worktree, &["diff", "HEAD", "--no-color", "--no-ext-diff", "--", rel])?;
    if diff.trim().is_empty() {
        // 신규(untracked) 파일 대비
        let d = run_git_allow_fail(worktree, &["diff", "--no-color", "--no-index", "--", "/dev/null", rel]).unwrap_or_default();
        return Ok(parse_unified_diff(&d));
    }
    Ok(parse_unified_diff(&diff))
}
```

- [ ] **Step 5: 명령 등록 + IPC 래퍼**

`lib.rs`: `mod files;`, invoke_handler에 `commands::list_worktree_files, commands::read_worktree_file, commands::git_file_diff,`.

`commands.rs`:

```rust
#[tauri::command]
pub async fn list_worktree_files(worktree_path: String) -> Result<Vec<crate::git::FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::list_files(&worktree_path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_worktree_file(worktree_path: String, rel_path: String) -> Result<crate::files::FileContent, String> {
    tauri::async_runtime::spawn_blocking(move || crate::files::read_file(&worktree_path, &rel_path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn git_file_diff(worktree_path: String, rel_path: String) -> Result<Vec<crate::git::DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::file_diff_lines(&worktree_path, &rel_path))
        .await.map_err(|e| e.to_string())?
}
```

`src/lib/ipc/files.ts` (마스터 계약대로):

```ts
import { invoke } from "@tauri-apps/api/core";

export type FileChange = "none" | "modified" | "new" | "deleted";
export interface FileEntry { path: string; dir: string; name: string; change: FileChange; add: number; del: number; }
export interface FileContent { content: string; isBinary: boolean; }
export type DiffLineKind = "add" | "del" | "ctx";
export interface DiffLine { kind: DiffLineKind; oldNo: number | null; newNo: number | null; text: string; }

export function listWorktreeFiles(worktreePath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_worktree_files", { worktreePath });
}
export function readWorktreeFile(worktreePath: string, relPath: string): Promise<FileContent> {
  return invoke<FileContent>("read_worktree_file", { worktreePath, relPath });
}
export function gitFileDiff(worktreePath: string, relPath: string): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("git_file_diff", { worktreePath, relPath });
}
```

- [ ] **Step 6: 테스트/커밋**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS.

```bash
git add src-tauri/src/git src-tauri/src/files src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/files.ts
git commit -m "feat: worktree 파일 목록·읽기·파일별 diff 명령 추가"
```

---

## Task B5: 공유 worktree (재사용 + 참조 카운트 삭제)

**Files:**
- Modify: `src-tauri/src/git/mod.rs` (worktree 존재 확인)
- Modify: `src-tauri/src/store/repo.rs` (같은 worktree_path 카운트)
- Modify: `src-tauri/src/commands.rs` (create_agent 재사용, delete_agent 참조 카운트)

**Interfaces:**
- create_agent: `worktreePath`가 이미 존재하는 디렉토리이고 다른 에이전트가 쓰면 생성 스킵, `worktreeManaged=false`.
- delete_agent: 같은 `worktree_path`를 쓰는 다른 에이전트가 있으면 디렉토리 제거 스킵.

- [ ] **Step 1: worktree 존재 확인 함수 + 참조 카운트 쿼리 테스트**

`git/mod.rs`:

```rust
/// 경로가 이미 유효한 git worktree인지(.git 파일/디렉토리 존재) 확인.
pub fn is_existing_worktree(path: &str) -> bool {
    std::path::Path::new(path).join(".git").exists()
}
```

`store/repo.rs`에 참조 카운트 쿼리 + 테스트:

```rust
/// 주어진 worktree_path를 사용하는 에이전트 수.
pub fn count_agents_by_worktree(conn: &Connection, worktree_path: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE worktree_path = ?1",
        params![worktree_path], |r| r.get(0),
    )
}
```

테스트(repo.rs tests 모듈):

```rust
#[test]
fn 같은_worktree_참조_카운트() {
    let conn = mem();
    let p = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
    let mut a1 = sample_agent(&p.id); a1.worktree_path = "/tmp/shared".into();
    let mut a2 = sample_agent(&p.id); a2.worktree_path = "/tmp/shared".into();
    insert_agent(&conn, &a1).unwrap();
    insert_agent(&conn, &a2).unwrap();
    assert_eq!(count_agents_by_worktree(&conn, "/tmp/shared").unwrap(), 2);
}
```

Run: `cd src-tauri && cargo test store::repo` → PASS(구현 후).

- [ ] **Step 2: create_agent 재사용 분기**

`commands.rs`의 `create_agent`에서 worktree 경로 결정 후, **명시적 경로가 이미 존재하는 worktree면 생성 스킵**:

```rust
let (wt_path, managed) = match worktree_path {
    Some(p) if !p.trim().is_empty() => (p, false),
    _ => {
        let base = app.path().app_data_dir().map_err(|e| e.to_string())?
            .join("worktrees").join(&project_id).join(&branch);
        (base.to_string_lossy().into_owned(), true)
    }
};

// 재사용: 경로가 이미 유효한 worktree면 git 생성 스킵.
let created = if git::is_existing_worktree(&wt_path) {
    std::fs::canonicalize(&wt_path).map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())?
} else {
    git::create_worktree(&project_path, &branch, &start_point, &wt_path)?
};
```

(이후 insert 로직은 기존과 동일. managed 값은 위에서 결정된 대로 유지 — 명시 경로 재사용은 managed=false.)

- [ ] **Step 3: delete_agent 참조 카운트**

`commands.rs`의 `delete_agent`에서 worktree 제거 조건에 참조 카운트 추가:

```rust
if let Some(a) = &agent {
    if remove_worktree && a.worktree_managed {
        // 같은 worktree를 쓰는 다른 에이전트가 있으면 디렉토리 제거 스킵.
        let refs = {
            let conn = store.0.lock().map_err(|e| e.to_string())?;
            store::repo::count_agents_by_worktree(&conn, &a.worktree_path).map_err(|e| e.to_string())?
        };
        if refs <= 1 {
            git::remove_worktree(&a.worktree_path, &a.worktree_path, force)?;
        }
    }
}
```

(delete_project도 동일 취지로 반영: 프로젝트 내 같은 worktree 공유 시 마지막 것만 제거 — 단, delete_project는 프로젝트 전체 삭제라 프로젝트 내 모든 에이전트가 사라지므로, worktree별로 1회만 remove하도록 dedup. `HashSet<worktree_path>`로 이미 제거한 경로는 스킵.)

- [ ] **Step 4: delete_project worktree dedup**

`commands.rs`의 `delete_project` worktree 정리 루프를 dedup:

```rust
let mut removed: std::collections::HashSet<String> = std::collections::HashSet::new();
for a in &p.agents {
    if a.worktree_managed && removed.insert(a.worktree_path.clone()) {
        if let Err(e) = git::remove_worktree(&p.path, &a.worktree_path, true) {
            failed_worktrees.push((a.worktree_path.clone(), e));
        }
    }
}
```

- [ ] **Step 5: 테스트/커밋**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS(기존 worktree 테스트 포함 회귀 없음).

```bash
git add src-tauri/src/git src-tauri/src/store/repo.rs src-tauri/src/commands.rs
git commit -m "feat: 공유 worktree 재사용 및 참조 카운트 기반 삭제"
```

---

## Phase B 완료 기준

- [ ] `cd src-tauri && cargo test` 전체 통과
- [ ] `mise exec -- pnpm check` 통과(신규 IPC 타입)
- [ ] 모든 신규 명령이 `lib.rs` invoke_handler에 등록됨
- [ ] 경로 이스케이프 방지 테스트 통과
- [ ] `code-reviewer`/`security-reviewer`로 리뷰 레인 실행(파일 읽기·훅 설치는 보안 민감 — 별도 승인)
