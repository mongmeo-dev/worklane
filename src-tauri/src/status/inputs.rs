use serde::{Deserialize, Serialize};

/// 에이전트의 실행 상태. 프론트의 AgentStatus 문자열과 일치하도록 직렬화된다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Idle,
    Blocked,
    Done,
}

/// 에이전트 훅(상태파일)이 노출하는 값. 상태파일 JSON의 "status" 필드와 대응.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookStatus {
    Working,
    WaitingInput,
    Done,
}

/// 상태 판정 리듀서의 입력 스냅샷.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StatusInputs {
    /// ① 프로세스 생존 여부
    pub process_alive: bool,
    /// ① 종료 시 exit code (살아있으면 None)
    pub exit_code: Option<i32>,
    /// ② 마지막 출력으로부터 경과(ms)
    pub ms_since_last_output: u64,
    /// ③ 상태파일이 알린 값 (없으면 None)
    pub hook_status: Option<HookStatus>,
    /// ③ 상태파일이 최근(HOOK_STALE_MS 이내) 것인가
    pub hook_fresh: bool,
}

/// ② 출력 무변화가 이 값을 넘으면 Idle로 본다.
pub const IDLE_THRESHOLD_MS: u64 = 2000;
/// ③ 상태파일이 이 값보다 오래되면 무시한다.
pub const HOOK_STALE_MS: u64 = 10000;
