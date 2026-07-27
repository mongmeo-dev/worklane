use crate::status::inputs::{AgentStatus, HookStatus, StatusInputs, IDLE_THRESHOLD_MS};

/// 세 신호를 종합해 최종 상태를 판정하는 순수 함수.
/// 우선순위: 프로세스 종료(최우선 게이트) > 신선한 훅 > 출력 무변화.
pub fn reduce(inputs: &StatusInputs) -> AgentStatus {
    // ① 프로세스가 종료됐으면 종료 코드로 성공/실패를 구분한다.
    if !inputs.process_alive {
        return if inputs.exit_code == Some(0) {
            AgentStatus::Done
        } else {
            AgentStatus::Failed
        };
    }

    // ③ 신선한 훅이 있으면 그 값을 신뢰
    if inputs.hook_fresh {
        if let Some(hook) = inputs.hook_status {
            return match hook {
                HookStatus::Working => AgentStatus::Running,
                HookStatus::WaitingInput => AgentStatus::Blocked,
                HookStatus::Done => AgentStatus::Done,
            };
        }
    }

    // ② 훅이 없거나 오래됐으면 출력 스트림으로 판정
    if inputs.ms_since_last_output < IDLE_THRESHOLD_MS {
        AgentStatus::Running
    } else {
        AgentStatus::Idle
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> StatusInputs {
        StatusInputs {
            process_alive: true,
            exit_code: None,
            ms_since_last_output: 0,
            hook_status: None,
            hook_fresh: false,
        }
    }

    #[test]
    fn 프로세스가_정상_종료되면_훅과_출력_무관하게_done() {
        let inputs = StatusInputs {
            process_alive: false,
            exit_code: Some(0),
            hook_status: Some(HookStatus::Working), // 훅이 Working이라 해도
            hook_fresh: true,
            ms_since_last_output: 0, // 출력이 최근이어도
        };
        assert_eq!(reduce(&inputs), AgentStatus::Done);
    }

    #[test]
    fn 프로세스가_비정상_종료되면_failed() {
        let inputs = StatusInputs {
            process_alive: false,
            exit_code: Some(127),
            hook_status: Some(HookStatus::Done),
            hook_fresh: true,
            ms_since_last_output: 999_999,
        };
        assert_eq!(reduce(&inputs), AgentStatus::Failed);
    }

    #[test]
    fn 종료_코드를_읽지_못한_종료도_failed() {
        let inputs = StatusInputs {
            process_alive: false,
            exit_code: None,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Failed);
    }

    #[test]
    fn 신선한_훅_working이면_running() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::Working),
            hook_fresh: true,
            ms_since_last_output: 999_999, // 출력이 오래돼도 훅 우선
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn 신선한_훅_waiting_input이면_blocked() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::WaitingInput),
            hook_fresh: true,
            ms_since_last_output: 999_999,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Blocked);
    }

    #[test]
    fn 신선한_훅_done이면_done() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::Done),
            hook_fresh: true,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Done);
    }

    #[test]
    fn 훅없고_최근출력이면_running() {
        let inputs = StatusInputs {
            hook_status: None,
            ms_since_last_output: IDLE_THRESHOLD_MS - 1,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn 훅없고_출력_멈추면_idle() {
        let inputs = StatusInputs {
            hook_status: None,
            ms_since_last_output: IDLE_THRESHOLD_MS,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Idle);
    }

    #[test]
    fn 오래된_훅은_무시하고_출력스트림으로_판정() {
        // 훅이 WaitingInput이지만 오래됨(hook_fresh=false) → 무시하고 ②로 fallback
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::WaitingInput),
            hook_fresh: false,
            ms_since_last_output: 100, // 최근 출력
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn tmux_시나리오_프로세스_살아있고_훅없고_출력활발이면_running() {
        // tmux 클라이언트가 살아있고, 훅 없고, 출력이 활발한 상황
        // 유사 도구가 실패하는 케이스를 못박는다.
        let inputs = StatusInputs {
            process_alive: true,
            hook_status: None,
            hook_fresh: false,
            ms_since_last_output: 200,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }
}
