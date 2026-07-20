use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use dashmap::DashMap;
use serde::Serialize;
use tauri::Emitter;

use crate::pty::session::{now_ms, Session};
use crate::status::engine::reduce;
use crate::status::inputs::{AgentStatus, StatusInputs, HOOK_STALE_MS};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusChanged {
    pub session_id: String,
    pub status: AgentStatus,
}

/// 250ms마다 모든 세션의 상태를 재계산하고, 변경분만 emit한다.
pub fn spawn_poller(app: tauri::AppHandle, state: Arc<DashMap<String, Arc<Session>>>) {
    std::thread::spawn(move || {
        let mut last: HashMap<String, AgentStatus> = HashMap::new();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let now = now_ms();

            // DashMap 순회 가드는 (id, Arc<Session>) 스냅샷만 뽑고 즉시 해제한다.
            // 파일 I/O(read_hook)나 락(is_alive)을 가드 안에서 하면 같은 샤드의
            // create/close(insert/remove)가 그 시간만큼 블록되므로, 가드 밖에서 처리한다.
            let sessions: Vec<(String, Arc<Session>)> = state
                .iter()
                .map(|entry| (entry.key().clone(), entry.value().clone()))
                .collect();

            // 현재 살아있는 세션 ID. last 맵에서 사라진(닫힌) 세션 항목을 정리하는 데 쓴다.
            let mut live_ids = std::collections::HashSet::with_capacity(sessions.len());

            for (sid, session) in sessions {
                live_ids.insert(sid.clone());

                let alive = session.is_alive();
                let last_out = session.last_output_ms.load(Ordering::Relaxed);
                let (hook_status, hook_fresh) = session.read_hook(now, HOOK_STALE_MS);

                let inputs = StatusInputs {
                    process_alive: alive,
                    exit_code: None,
                    ms_since_last_output: now.saturating_sub(last_out),
                    hook_status,
                    hook_fresh,
                };
                let status = reduce(&inputs);

                if last.get(&sid) != Some(&status) {
                    last.insert(sid.clone(), status);
                    let _ = app.emit(
                        "status-changed",
                        StatusChanged { session_id: sid.clone(), status },
                    );
                }
            }

            // 닫힌 세션 항목을 last 맵에서 제거해 무한 증가를 막는다.
            last.retain(|id, _| live_ids.contains(id));
        }
    });
}
