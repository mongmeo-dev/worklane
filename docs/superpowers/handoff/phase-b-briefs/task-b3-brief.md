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

