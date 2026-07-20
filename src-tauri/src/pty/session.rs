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
    pub last_output_ms: AtomicU64,
    /// ③ 이 세션의 상태파일이 놓이는 디렉토리.
    pub hook_dir: PathBuf,
}

impl Session {
    /// 출력이 발생했음을 기록한다.
    pub fn mark_output(&self, now_ms: u64) {
        self.last_output_ms.store(now_ms, Ordering::Relaxed);
    }
}

/// 현재 시각을 UNIX epoch 밀리초로 반환.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
