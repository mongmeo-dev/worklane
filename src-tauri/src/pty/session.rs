use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{Child, MasterPty};

/// 하나의 PTY 세션. 필드별 Mutex로 펌프 스레드/입력/리사이즈/종료가
/// 서로 다른 핸들에 동시 접근할 수 있게 한다.
pub struct Session {
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub child: Mutex<Box<dyn Child + Send + Sync>>,
    /// ② 마지막 출력 시각 (UNIX epoch ms). 펌프 스레드가 갱신한다.
    /// 사용자 입력 에코는 제외되므로 "에이전트 활동" 시각에 가깝다.
    pub last_output_ms: AtomicU64,
    /// ② 마지막 사용자 입력 시각 (UNIX epoch ms). write()가 갱신한다.
    /// 입력 직후의 출력(에코)을 걸러내는 데 쓴다. 0이면 입력 이력 없음.
    pub last_input_ms: AtomicU64,
    /// ③ 이 세션의 상태파일이 놓이는 디렉토리.
    pub hook_dir: PathBuf,
    /// ③ 에이전트별 상태 프로브가 상태파일을 찾는 기준 작업 디렉터리.
    pub cwd: PathBuf,
    /// ③ PTY로 직접 스폰한 자식 pid. 프로브의 프로세스 트리 매칭에 쓴다. (없으면 None)
    pub child_pid: Option<u32>,
    /// ③ 상태 프로브 백그라운드 태스크 핸들. 세션 종료(close) 시 abort한다.
    pub hook_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Session {
    /// 출력이 발생했음을 기록한다. 단, 사용자 입력 직후 ECHO_SUPPRESS_MS
    /// 이내에 도착한 출력은 입력 에코로 보고 활동 시각을 갱신하지 않는다.
    /// (타이핑만으로 상태가 Running으로 튀는 것을 막는다.)
    pub fn mark_output(&self, now_ms: u64) {
        let last_input = self.last_input_ms.load(Ordering::Relaxed);
        if !is_input_echo(now_ms, last_input, ECHO_SUPPRESS_MS) {
            self.last_output_ms.store(now_ms, Ordering::Relaxed);
        }
    }

    /// 사용자 입력이 발생했음을 기록한다. (출력 에코 억제용)
    pub fn mark_input(&self, now_ms: u64) {
        self.last_input_ms.store(now_ms, Ordering::Relaxed);
    }

    /// ① 프로세스 생존 여부와 종료 코드를 한 번의 `try_wait`로 확인한다.
    pub fn process_state(&self) -> (bool, Option<i32>) {
        match self.child.lock() {
            Ok(mut child) => match child.try_wait() {
                Ok(None) => (true, None),
                Ok(Some(status)) => (false, Some(status.exit_code() as i32)),
                Err(_) => (false, None),
            },
            Err(_) => (false, None),
        }
    }

    /// ③ 상태파일(status.json)을 읽어 (HookStatus, 신선도)를 반환한다.
    /// 파일이 없거나 파싱 실패면 (None, false).
    pub fn read_hook(&self, now_ms_val: u64, stale_ms: u64) -> (Option<crate::status::HookStatus>, bool) {
        let path = self.hook_dir.join("status.json");
        let Ok(meta) = std::fs::metadata(&path) else {
            return (None, false);
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let fresh = now_ms_val.saturating_sub(mtime_ms) <= stale_ms;

        let Ok(text) = std::fs::read_to_string(&path) else {
            return (None, false);
        };
        #[derive(serde::Deserialize)]
        struct HookFile {
            status: crate::status::HookStatus,
        }
        match serde_json::from_str::<HookFile>(&text) {
            Ok(f) => (Some(f.status), fresh),
            Err(_) => (None, false),
        }
    }
}

/// 현재 시각을 UNIX epoch 밀리초로 반환.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// ② 사용자 입력 직후 이 시간(ms) 이내에 도착한 PTY 출력은 입력 에코로 간주해
/// 에이전트 활동에서 제외한다. PTY 에코 지연(보통 수~수십 ms)보다 넉넉히 크고,
/// 실제 에이전트 출력을 놓칠 만큼 크지 않은 값으로 잡는다.
pub const ECHO_SUPPRESS_MS: u64 = 200;

/// 주어진 출력 시각이 마지막 입력의 에코 억제 창 이내인지 판정한다.
/// `last_input_ms == 0`(입력 이력 없음)이면 항상 false.
pub fn is_input_echo(now_ms: u64, last_input_ms: u64, window_ms: u64) -> bool {
    last_input_ms != 0 && now_ms.saturating_sub(last_input_ms) <= window_ms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 입력_이력_없으면_에코아님() {
        assert!(!is_input_echo(1000, 0, ECHO_SUPPRESS_MS));
    }

    #[test]
    fn 입력_직후_출력은_에코() {
        // 입력 5ms 뒤 도착한 출력 → 에코
        assert!(is_input_echo(10_005, 10_000, ECHO_SUPPRESS_MS));
    }

    #[test]
    fn 창_경계까지는_에코() {
        assert!(is_input_echo(10_000 + ECHO_SUPPRESS_MS, 10_000, ECHO_SUPPRESS_MS));
    }

    #[test]
    fn 창_넘긴_출력은_에코아님() {
        // 입력 후 창을 1ms 넘겨 도착 → 실제 에이전트 출력
        assert!(!is_input_echo(10_001 + ECHO_SUPPRESS_MS, 10_000, ECHO_SUPPRESS_MS));
    }
}
