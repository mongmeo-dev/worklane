//! 에이전트별 상태 프로브(3계층 트래킹의 계층 ③).
//!
//! 상태 엔진/폴러는 `hook_dir/status.json`만 소비한다. 따라서 각 프로브는
//! 세션을 감시하며 이 파일을 갱신(입력 대기/완료 등 override)하거나 지운다
//! (지우면 엔진이 계층 ①/② — 프로세스 생존·출력 스트림 — 로 폴백한다).
//!
//! 새 에이전트 지원은 `StatusProbe`를 구현해 `probes()`에 등록하기만 하면 되며,
//! 엔진·폴러·프론트엔드는 손대지 않는다.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::pty::session::Session;
use crate::status::HookStatus;

pub mod gjc;

/// 프로브가 세션 감시를 시작할 때 받는 컨텍스트.
pub struct ProbeContext {
    /// 세션 식별자(로그/디버그용).
    pub session_id: String,
    /// 에이전트 실행 작업 디렉터리(상태 신호 탐색 기준).
    pub cwd: PathBuf,
    /// 상태파일(status.json)이 놓이는 디렉토리.
    pub hook_dir: PathBuf,
    /// PTY로 직접 스폰한 자식 pid(프로세스 트리 매칭용).
    pub child_pid: Option<u32>,
}

/// 에이전트별 상태 소스. 실행 커맨드로 매칭하고, 매칭 시 백그라운드 감시를 시작한다.
pub trait StatusProbe: Send + Sync {
    /// 로그/디버그용 이름.
    fn name(&self) -> &'static str;
    /// 이 프로브가 주어진 실행 커맨드를 담당하는지 판정한다.
    fn matches(&self, cmd: &str) -> bool;
    /// 세션 감시 태스크를 스폰하고 핸들을 반환한다. 세션 종료 시 abort된다.
    fn start(&self, ctx: ProbeContext) -> tauri::async_runtime::JoinHandle<()>;
}

/// 등록된 프로브 목록. 첫 매칭 프로브가 세션을 담당한다.
fn probes() -> Vec<Box<dyn StatusProbe>> {
    vec![Box::new(gjc::GjcProbe)]
}

/// 커맨드에 맞는 프로브가 있으면 감시를 시작하고 핸들을 세션에 저장한다.
/// 매칭 프로브가 없으면 아무 일도 하지 않는다(계층 ①/②만으로 트래킹).
pub fn start_for_session(cmd: &str, session_id: &str, session: &Arc<Session>) {
    for probe in probes() {
        if !probe.matches(cmd) {
            continue;
        }
        let ctx = ProbeContext {
            session_id: session_id.to_string(),
            cwd: session.cwd.clone(),
            hook_dir: session.hook_dir.clone(),
            child_pid: session.child_pid,
        };
        log::debug!("상태 프로브 '{}' 시작: session={}", probe.name(), session_id);
        let handle = probe.start(ctx);
        if let Ok(mut slot) = session.hook_task.lock() {
            *slot = Some(handle);
        }
        break;
    }
}

/// `hook_dir/status.json`에 상태를 원자적으로 기록한다(temp 작성 후 rename).
/// rename은 대상 파일의 mtime을 갱신하므로 폴러의 신선도 판정에도 유효하다.
pub fn write_status(hook_dir: &Path, status: HookStatus) {
    #[derive(serde::Serialize)]
    struct HookFile {
        status: HookStatus,
    }
    let Ok(body) = serde_json::to_string(&HookFile { status }) else {
        return;
    };
    let path = hook_dir.join("status.json");
    let tmp = hook_dir.join("status.json.tmp");
    if std::fs::write(&tmp, body.as_bytes()).is_ok() {
        let _ = std::fs::rename(&tmp, &path);
    }
}

/// 상태 override를 제거해 엔진이 계층 ①/②로 폴백하도록 한다.
pub fn clear_status(hook_dir: &Path) {
    let _ = std::fs::remove_file(hook_dir.join("status.json"));
}
