//! gjc(gajae-code) 상태 프로브.
//!
//! gjc는 실행 중인 top-level 세션마다 디스커버리 파일
//! `<repo>/.gjc/state/sdk/<sessionId>.json` 을 남기고, 그 안의 loopback
//! WebSocket(`ws://127.0.0.1:<port>/?token=…`)으로 `action_needed` /
//! `action_resolved` / `session_closed` 등의 상태 프레임을 흘려보낸다.
//! (tmux 유무와 무관하게 동작한다.)
//!
//! 이 프로브는 **관찰자**다. 디스커버리 파일을 찾아 WS에 붙고, 프레임을
//! `hook_dir/status.json`으로 번역해 계층 ③을 채운다. 사용자 응답은 여전히
//! PTY(터미널)로 이뤄지며, 이 브리지는 어떤 프레임도 전송하지 않는다.
//!
//! 핵심 강화점: **입력 대기(blocked)** 는 출력 스트림만으로는 유휴(idle)와
//! 구분할 수 없다(둘 다 무출력). gjc의 `action_needed(ask)` 프레임이 이를
//! 정확히 알려준다.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use serde::Deserialize;

use crate::pty::session::now_ms;
use crate::status::HookStatus;

use super::{clear_status, write_status, ProbeContext, StatusProbe};

/// 디스커버리 파일이 이보다 오래되면(ms) 죽은 세션 잔재로 보고 무시한다.
const DISCOVERY_STALE_MS: u64 = 15_000;
/// 디스커버리 재탐색/재접속 간격(ms).
const RETRY_MS: u64 = 1_000;
/// status.json 신선도 유지용 하트비트 간격(ms).
/// 계층 ③의 HOOK_STALE_MS(10s)보다 충분히 작아, 장시간 blocked 대기에도
/// 상태파일이 stale로 떨어져 계층 ②(무출력→idle)로 오판되지 않게 한다.
const HEARTBEAT_MS: u64 = 3_000;

pub struct GjcProbe;

impl StatusProbe for GjcProbe {
    fn name(&self) -> &'static str {
        "gjc"
    }

    fn matches(&self, cmd: &str) -> bool {
        command_is_gjc(cmd)
    }

    fn start(&self, ctx: ProbeContext) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            run_bridge(ctx).await;
        })
    }
}

/// 실행 커맨드의 프로그램 토큰이 `gjc`인지 판정한다.
/// `gjc`, `gjc --tmux --worktree x`, `/opt/homebrew/bin/gjc`, `gjc.exe` 를 인식한다.
fn command_is_gjc(cmd: &str) -> bool {
    let Some(first) = cmd.split_whitespace().next() else {
        return false;
    };
    let base = Path::new(first)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(first);
    let base = base.strip_suffix(".exe").unwrap_or(base);
    base == "gjc"
}

#[derive(Clone)]
struct Endpoint {
    url: String,
    token: String,
}

/// gjc SDK 디스커버리 파일 스키마(필요한 필드만).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Discovery {
    #[serde(default)]
    pid: Option<u32>,
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    updated_at: Option<u64>,
    #[serde(default)]
    stale: Option<bool>,
}

/// 프레임 해석 결과: 상태파일에 무엇을 할지.
enum Effect {
    /// 주어진 상태로 override(입력 대기/작업중/완료).
    Set(HookStatus),
    /// override 제거 → 엔진이 계층 ①/②로 폴백.
    Clear,
}

/// gjc가 시작되길 기다리며 엔드포인트를 찾고, WS에 붙어 상태 프레임을 소비한다.
/// 무한 루프이며, 세션 종료(close)로 태스크가 abort되면 종료된다.
async fn run_bridge(ctx: ProbeContext) {
    loop {
        if let Some(ep) = find_endpoint(&ctx) {
            run_connection(&ctx, ep).await;
            // 연결이 끊기면 override를 지워 엔진이 계층 ①/②로 즉시 폴백하게 한다.
            clear_status(&ctx.hook_dir);
        }
        tokio::time::sleep(Duration::from_millis(RETRY_MS)).await;
    }
}

/// 하나의 WS 연결을 유지하며 프레임을 상태파일로 번역한다. 끊기면 반환한다.
async fn run_connection(ctx: &ProbeContext, ep: Endpoint) {
    let sep = if ep.url.contains('?') { '&' } else { '?' };
    let url = format!("{}{}token={}", ep.url.trim_end_matches('/'), sep, ep.token);

    let ws = match tokio_tungstenite::connect_async(&url).await {
        Ok((ws, _resp)) => ws,
        Err(_) => return, // 다음 재탐색에서 회복
    };
    log::debug!("gjc SDK 연결됨: session={}", ctx.session_id);
    // 우리는 관찰자이므로 write 절반은 쓰지 않는다.
    let (_write, mut read) = ws.split();

    // 연결 직후에는 override 없이 시작한다(엔진이 계층 ②로 판단).
    // 첫 유의미 프레임이 상태를 정한다. gjc는 접속 시 미해결 ask를 재전송한다.
    let mut current: Option<HookStatus> = None;
    let mut heartbeat = tokio::time::interval(Duration::from_millis(HEARTBEAT_MS));
    heartbeat.tick().await; // 최초 즉시 tick 소비

    loop {
        tokio::select! {
            frame = read.next() => {
                match frame {
                    Some(Ok(msg)) => {
                        if msg.is_close() {
                            break;
                        }
                        if msg.is_text() {
                            if let Ok(text) = msg.into_text() {
                                if let Some(effect) = map_frame(text.as_ref()) {
                                    apply(effect, &mut current, &ctx.hook_dir);
                                }
                            }
                        }
                        // ping/pong/binary 등은 무시.
                    }
                    Some(Err(_)) | None => break,
                }
            }
            _ = heartbeat.tick() => {
                // 하트비트: 현재 override가 있으면 mtime을 갱신해 신선도를 유지한다.
                if let Some(status) = current {
                    write_status(&ctx.hook_dir, status);
                }
            }
        }
    }
}

/// 프레임 효과를 상태파일과 로컬 상태에 반영한다.
fn apply(effect: Effect, current: &mut Option<HookStatus>, hook_dir: &Path) {
    match effect {
        Effect::Set(status) => {
            *current = Some(status);
            write_status(hook_dir, status);
        }
        Effect::Clear => {
            *current = None;
            clear_status(hook_dir);
        }
    }
}

/// 서버→클라이언트 프레임을 상태 효과로 번역한다. 관심 없는 프레임은 None.
fn map_frame(txt: &str) -> Option<Effect> {
    let value: serde_json::Value = serde_json::from_str(txt).ok()?;
    let typ = value.get("type").and_then(|t| t.as_str())?;
    match typ {
        // 무언가 사람의 개입을 요구함.
        "action_needed" => {
            let kind = value.get("kind").and_then(|k| k.as_str()).unwrap_or("");
            match kind {
                // 질문/승인 대기 = 입력 대기(blocked). 출력만으로는 못 잡는 핵심 신호.
                "ask" => Some(Effect::Set(HookStatus::WaitingInput)),
                // "작업 마치고 다음 지시 대기" = 유휴. 계층 ②와 일치하므로 폴백.
                "idle" => Some(Effect::Clear),
                // 알 수 없는 요구는 안전하게 주의 필요로 취급.
                _ => Some(Effect::Set(HookStatus::WaitingInput)),
            }
        }
        // 대기가 해소됨 → override 제거 후 계층 ①/②가 이어받음(작업 재개=출력→running).
        "action_resolved" => Some(Effect::Clear),
        // 세션 종료 프레임. (프로세스 사망 시 계층 ①이 Done을 확정하지만 선반영한다.)
        "session_closed" => Some(Effect::Set(HookStatus::Done)),
        // 활동 지표(문서에 정확한 스키마가 없어 방어적으로 파싱). 무출력 중 작업을 잡는다.
        "activity" => match activity_is_busy(&value) {
            Some(true) => Some(Effect::Set(HookStatus::Working)),
            Some(false) => Some(Effect::Clear),
            None => None,
        },
        // hello/pong/context_update/turn_stream 등은 상태와 무관 → 무시.
        _ => None,
    }
}

/// `activity` 프레임에서 바쁨 여부를 방어적으로 추출한다.
/// 후보 필드가 bool이면 그대로, 문자열이면 키워드로 판정한다. 판정 불가면 None.
fn activity_is_busy(value: &serde_json::Value) -> Option<bool> {
    for key in ["state", "status", "activity", "busy", "phase"] {
        let Some(field) = value.get(key) else {
            continue;
        };
        if let Some(b) = field.as_bool() {
            return Some(b);
        }
        if let Some(s) = field.as_str() {
            let s = s.to_ascii_lowercase();
            if s.contains("busy") || s.contains("work") || s.contains("active") || s.contains("run")
            {
                return Some(true);
            }
            if s.contains("idle") || s.contains("wait") || s.contains("done") {
                return Some(false);
            }
        }
    }
    None
}

/// cwd에서 위로 올라가며 `.gjc/state/sdk` 디렉토리를 찾는다.
/// (gjc는 저장소/워크트리 루트에 `.gjc/`를 만들며, cwd가 그 하위일 수 있다.)
fn sdk_dir(cwd: &Path) -> Option<PathBuf> {
    let mut cur = Some(cwd);
    let mut depth = 0;
    while let Some(dir) = cur {
        let candidate = dir.join(".gjc").join("state").join("sdk");
        if candidate.is_dir() {
            return Some(candidate);
        }
        depth += 1;
        if depth > 40 {
            break;
        }
        cur = dir.parent();
    }
    None
}

/// 현재 세션에 해당하는 살아있는 gjc 엔드포인트를 찾는다.
/// 우선순위: (자식 프로세스 트리에 속한 pid) > (더 최근 updatedAt).
fn find_endpoint(ctx: &ProbeContext) -> Option<Endpoint> {
    let dir = sdk_dir(&ctx.cwd)?;
    let now = now_ms();
    let snapshot = ProcSnapshot::capture();
    let descendants = ctx.child_pid.map(|pid| snapshot.descendants_of(pid));

    let mut best: Option<(u64, bool, Endpoint)> = None;
    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(disc) = serde_json::from_str::<Discovery>(&text) else {
            continue;
        };
        if disc.stale == Some(true) {
            continue;
        }
        let updated = disc.updated_at.unwrap_or(0);
        if now.saturating_sub(updated) > DISCOVERY_STALE_MS {
            continue;
        }
        // pid 생존 확인(스냅샷이 비었으면 판정을 건너뛴다 — 오탐으로 전부 버리지 않도록).
        if let Some(pid) = disc.pid {
            if !snapshot.alive.is_empty() && !snapshot.is_alive(pid) {
                continue;
            }
        }
        let Some(token) = disc.token.clone() else {
            continue;
        };
        let url = match disc.url.clone() {
            Some(u) if !u.is_empty() => u,
            _ => match (disc.host.as_deref(), disc.port) {
                (Some(h), Some(p)) => format!("ws://{h}:{p}"),
                _ => continue,
            },
        };
        let pid_match = match (&descendants, disc.pid) {
            (Some(set), Some(pid)) => set.contains(&pid),
            _ => false,
        };
        let candidate = Endpoint { url, token };
        let better = match &best {
            None => true,
            Some((best_updated, best_match, _)) => {
                (pid_match && !best_match) || (pid_match == *best_match && updated > *best_updated)
            }
        };
        if better {
            best = Some((updated, pid_match, candidate));
        }
    }
    best.map(|(_, _, ep)| ep)
}

/// 프로세스 스냅샷(pid→ppid, 생존 pid 집합). sysinfo 한 번 refresh로 채운다.
struct ProcSnapshot {
    parent: HashMap<u32, u32>,
    alive: HashSet<u32>,
}

impl ProcSnapshot {
    fn capture() -> Self {
        use sysinfo::{ProcessesToUpdate, System};
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let mut parent = HashMap::new();
        let mut alive = HashSet::new();
        for (pid, process) in sys.processes() {
            let pid = pid.as_u32();
            alive.insert(pid);
            if let Some(ppid) = process.parent() {
                parent.insert(pid, ppid.as_u32());
            }
        }
        Self { parent, alive }
    }

    fn is_alive(&self, pid: u32) -> bool {
        self.alive.contains(&pid)
    }

    /// root의 모든 자손 pid(자신 포함). 조상 체인을 최대 64단계까지 추적한다.
    fn descendants_of(&self, root: u32) -> HashSet<u32> {
        let mut set = HashSet::new();
        for &pid in self.alive.iter() {
            let mut cur = pid;
            let mut steps = 0;
            while let Some(&ppid) = self.parent.get(&cur) {
                if ppid == root {
                    set.insert(pid);
                    break;
                }
                cur = ppid;
                steps += 1;
                if steps > 64 {
                    break;
                }
            }
        }
        set.insert(root);
        set
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 커맨드가_gjc면_매칭한다() {
        assert!(command_is_gjc("gjc"));
        assert!(command_is_gjc("gjc --tmux --worktree feat"));
        assert!(command_is_gjc("/opt/homebrew/bin/gjc"));
        assert!(command_is_gjc("gjc.exe --tmux"));
    }

    #[test]
    fn 다른_커맨드는_매칭하지_않는다() {
        assert!(!command_is_gjc("claude"));
        assert!(!command_is_gjc("codex"));
        assert!(!command_is_gjc("cd gjc && ls"));
        assert!(!command_is_gjc(""));
        assert!(!command_is_gjc("   "));
    }

    fn set_status(effect: Option<Effect>) -> Option<HookStatus> {
        match effect {
            Some(Effect::Set(s)) => Some(s),
            _ => None,
        }
    }

    #[test]
    fn action_needed_ask는_입력대기() {
        let f = r#"{"type":"action_needed","id":"act_1","kind":"ask","question":"Proceed?"}"#;
        assert_eq!(set_status(map_frame(f)), Some(HookStatus::WaitingInput));
    }

    #[test]
    fn action_needed_idle는_override_해제() {
        let f = r#"{"type":"action_needed","id":"idle-1","kind":"idle","summary":"done"}"#;
        assert!(matches!(map_frame(f), Some(Effect::Clear)));
    }

    #[test]
    fn action_resolved는_override_해제() {
        let f = r#"{"type":"action_resolved","id":"act_1","resolvedBy":"local"}"#;
        assert!(matches!(map_frame(f), Some(Effect::Clear)));
    }

    #[test]
    fn session_closed는_완료() {
        let f = r#"{"type":"session_closed"}"#;
        assert_eq!(set_status(map_frame(f)), Some(HookStatus::Done));
    }

    #[test]
    fn 알수없는_kind의_action_needed는_안전하게_입력대기() {
        let f = r#"{"type":"action_needed","id":"x","kind":"weird"}"#;
        assert_eq!(set_status(map_frame(f)), Some(HookStatus::WaitingInput));
    }

    #[test]
    fn 관심없는_프레임은_무시() {
        assert!(map_frame(r#"{"type":"hello"}"#).is_none());
        assert!(map_frame(r#"{"type":"pong"}"#).is_none());
        assert!(map_frame("not json").is_none());
        assert!(map_frame(r#"{"noType":1}"#).is_none());
    }

    #[test]
    fn activity_busy_문자열과_bool을_방어적으로_해석() {
        assert_eq!(activity_is_busy(&serde_json::json!({"state":"busy"})), Some(true));
        assert_eq!(activity_is_busy(&serde_json::json!({"state":"idle"})), Some(false));
        assert_eq!(activity_is_busy(&serde_json::json!({"busy":true})), Some(true));
        assert_eq!(activity_is_busy(&serde_json::json!({"busy":false})), Some(false));
        assert_eq!(activity_is_busy(&serde_json::json!({"unrelated":1})), None);
    }

    #[test]
    fn 자손_pid_집계는_체인을_따라간다() {
        let mut parent = HashMap::new();
        // 100 → 200 → 300 (100이 최상위 조상)
        parent.insert(200u32, 100u32);
        parent.insert(300u32, 200u32);
        parent.insert(400u32, 999u32); // 무관한 트리
        let mut alive = HashSet::new();
        for p in [100u32, 200, 300, 400, 999] {
            alive.insert(p);
        }
        let snap = ProcSnapshot { parent, alive };
        let desc = snap.descendants_of(100);
        assert!(desc.contains(&100));
        assert!(desc.contains(&200));
        assert!(desc.contains(&300));
        assert!(!desc.contains(&400));
        assert!(!desc.contains(&999));
    }
}
