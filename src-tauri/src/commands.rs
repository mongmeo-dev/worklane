use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::Manager;

use crate::pty::{self, PtyOutput, PtyState};

/// 세션의 상태파일 디렉토리 경로를 계산한다. (app_data_dir/hooks/<session_id>)
fn hook_dir_for(app: &tauri::AppHandle, session_id: &str) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("hooks")
        .join(session_id);
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

#[tauri::command]
pub async fn create_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    session_id: String,
    cmd: String,
    cwd: String,
    rows: u16,
    cols: u16,
    on_output: Channel<PtyOutput>,
) -> Result<(), String> {
    let hook_dir = hook_dir_for(&app, &session_id)?;
    let state_inner = state.0.clone();
    // 블로킹 가능성이 있는 open/spawn을 별도 스레드에서.
    let sid = session_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let temp = PtyState(state_inner);
        pty::create(&temp, sid, cmd, cwd, rows, cols, hook_dir, on_output)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_to_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    pty::write(&state, &session_id, data)
}

#[tauri::command]
pub fn resize_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    pty::resize(&state, &session_id, rows, cols)
}

#[tauri::command]
pub fn close_session(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    pty::close(&state, &session_id)
}

/// 시스템에 설치된 폰트 패밀리 이름을 열거한다. 자동완성 목록으로 사용된다.
/// 실패 시 에러 문자열을 반환하며, 프론트는 이를 조용히 무시하고 빈 목록으로 폴백한다.
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let mut names = source
        .all_families()
        .map_err(|e| e.to_string())?;
    names.sort();
    names.dedup();
    Ok(names)
}
