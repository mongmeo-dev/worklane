mod status;
mod pty;
mod commands;

use pty::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
