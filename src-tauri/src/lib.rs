mod status;
mod pty;
mod git;
mod commands;

use pty::PtyState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .setup(|app| {
            let state = app.state::<PtyState>();
            let map = state.0.clone();
            status::poller::spawn_poller(app.handle().clone(), map);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_session,
            commands::git_diff,
            commands::list_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
