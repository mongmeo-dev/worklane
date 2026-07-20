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
            for entry in state.iter() {
                let sid = entry.key().clone();
                let session = entry.value();

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
        }
    });
}
