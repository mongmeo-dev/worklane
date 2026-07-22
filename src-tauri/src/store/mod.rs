pub mod models;
pub mod repo;

use std::sync::Mutex;
use rusqlite::Connection;

/// SQLite 연결을 감싼 Tauri 관리 상태.
pub struct StoreState(pub Mutex<Connection>);
