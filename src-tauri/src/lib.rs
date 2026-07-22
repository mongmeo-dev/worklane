mod status;
mod pty;
mod git;
mod commands;
mod store;

use pty::PtyState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::default())
        .setup(|app| {
            let state = app.state::<PtyState>();
            let map = state.0.clone();
            status::poller::spawn_poller(app.handle().clone(), map);

            // 저장소 초기화
            let db_path = app.path().app_data_dir()
                .expect("app_data_dir 없음").join("workspace.db");
            std::fs::create_dir_all(db_path.parent().unwrap()).ok();
            let conn = store::open(&db_path).expect("DB 열기 실패");
            app.manage(store::StoreState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_session,
            commands::git_diff,
            commands::list_system_fonts,
            commands::list_projects,
            commands::create_project,
            commands::delete_project,
            commands::create_agent,
            commands::delete_agent,
            commands::agent_worktree_has_changes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
