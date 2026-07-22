pub mod models;
pub mod repo;

use std::path::Path;
use std::sync::Mutex;
use rusqlite::Connection;

/// SQLite 연결을 감싼 Tauri 관리 상태.
pub struct StoreState(pub Mutex<Connection>);

/// DB 파일을 열고 foreign_keys를 켠 뒤 마이그레이션한다.
pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    repo::migrate(&conn)?;
    Ok(conn)
}
