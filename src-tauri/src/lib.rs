mod status;
mod system;
mod usage;
mod files;
mod pty;
mod git;
mod commands;
mod store;
mod external;
mod verify;
mod ports;

use pty::PtyState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
            commands::git_review_status,
            commands::git_commit_all,
            commands::git_push,
            commands::git_open_pull_request,
            commands::open_in_app,
            commands::github_issues,
            commands::run_verification,
            commands::detect_preview_ports,
            commands::list_prompts,
            commands::create_prompt,
            commands::update_prompt,
            commands::delete_prompt,
            commands::create_checkpoint,
            commands::list_checkpoints,
            commands::rollback_checkpoint,
            commands::delete_checkpoint,
            commands::list_tasks,
            commands::create_task,
            commands::update_task,
            commands::set_task_status,
            commands::delete_task,
            commands::record_event,
            commands::list_events,
            commands::list_worktree_files,
            commands::read_worktree_file,
            commands::git_file_diff,
            commands::read_system_resources,
            commands::read_codex_usage,
            commands::read_claude_usage,
            commands::install_claude_statusline,
            commands::list_system_fonts,
            commands::list_projects,
            commands::create_project,
            commands::create_project_with_default_agent,
            commands::create_default_agent,
            commands::delete_project,
            commands::create_agent,
            commands::delete_agent,
            commands::agent_worktree_has_changes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
