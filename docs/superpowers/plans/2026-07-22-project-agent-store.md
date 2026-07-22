# 프로젝트/에이전트 영속 저장소 및 worktree 격리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목데이터(`mockProjects`)를 제거하고, 사용자가 등록한 프로젝트/에이전트를 SQLite에 영속화하며, 에이전트 생성 시 격리된 git worktree를 자동 생성하고 실제 PTY로 실행한다.

**Architecture:** Rust 백엔드에 rusqlite 기반 저장소 계층과 git worktree 관리 함수를 추가하고, Tauri 커맨드로 노출한다. 프론트엔드는 Svelte 5 룬 스토어가 목데이터를 대체하며, 정적 정의(DB)와 런타임 상태(세션 스토어)를 병합해 표시한다. worktree 생성/DB insert는 원자적으로 처리한다.

**Tech Stack:** Tauri v2, Rust, rusqlite(bundled), Svelte 5 (룬), TypeScript, Vitest, `@tauri-apps/plugin-dialog`

## Global Constraints

- 문서/주석/UI 텍스트는 한글로 작성한다(코드·고유명사 제외).
- 커밋 메시지는 한글로 작성하고 Co-Author를 포함하지 않는다. 한 커밋에 하나의 기능 변경만 담는다.
- 코드 수정 커밋에는 `[ci skip]`을 붙이지 않는다(CI 통과 필요).
- Rust 명령 실행 시 환경변수 주입이 필요하면 `mise exec -- ` 접두어를 사용한다.
- `status`, `lastActivity`는 DB에 저장하지 않는 런타임 파생값이다.
- 파괴적 작업(생성/삭제)의 에러는 조용히 폴백하지 않고 반드시 UI에 노출한다.
- 프론트 테스트 실행: `pnpm test`. Rust 테스트 실행: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml`.

## 파일 구조

**백엔드 (신규/수정)**
- `src-tauri/Cargo.toml` — rusqlite(bundled), uuid 의존성 추가
- `src-tauri/src/store/mod.rs` — 저장소 모듈 진입점, `StoreState`, 마이그레이션
- `src-tauri/src/store/models.rs` — `Project`, `Agent` serde 구조체
- `src-tauri/src/store/repo.rs` — CRUD 함수 (rusqlite)
- `src-tauri/src/git/mod.rs` — `create_worktree`/`remove_worktree`/`worktree_has_changes` 추가
- `src-tauri/src/commands.rs` — 프로젝트/에이전트 커맨드 추가
- `src-tauri/src/lib.rs` — 모듈/State/핸들러 등록

**프론트엔드 (신규/수정)**
- `src/lib/types.ts` — `Agent.command` 추가, 저장/런타임 필드 분리
- `src/lib/data/labels.ts` — 라벨 상수 + kind별 기본 커맨드 (신규)
- `src/lib/data/mock.ts` — 삭제
- `src/lib/ipc/projects.ts` — IPC 래퍼 (신규)
- `src/lib/stores/projects.svelte.ts` — 반응형 스토어 (신규)
- `src/lib/stores/uiSettings.svelte.ts` — `skipWorktreeDeletePrompt` 플래그 (신규)
- `src/lib/components/shell/Sidebar.svelte` — import 갱신, 추가/삭제 진입점
- `src/lib/components/shell/MainPanel.svelte` — import 갱신, PTY 실행 연결
- `src/lib/components/shell/StatusDot.svelte` — import 갱신
- `src/lib/components/shell/ProjectDialog.svelte` — 프로젝트 추가 (신규)
- `src/lib/components/shell/AgentDialog.svelte` — 에이전트 추가 (신규)
- `src/lib/components/shell/DeleteAgentDialog.svelte` — 삭제 확인 (신규)
- `src/App.svelte` — 스토어 로드, 빈 상태

---

### Task 1: Rust 저장소 의존성 및 데이터 모델

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/store/mod.rs`
- Create: `src-tauri/src/store/models.rs`

**Interfaces:**
- Produces:
  - `store::models::Project { id: String, name: String, path: String, created_at: i64, updated_at: i64, agents: Vec<Agent> }` (serde, camelCase 직렬화)
  - `store::models::Agent { id: String, project_id: String, title: String, kind: String, command: String, branch: String, worktree_path: String, worktree_managed: bool, created_at: i64, updated_at: i64 }` (serde, camelCase)

- [ ] **Step 1: 의존성 추가**

`src-tauri/Cargo.toml`의 `[dependencies]`에 추가:

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: 모델 구조체 작성**

`src-tauri/src/store/models.rs` 생성:

```rust
use serde::{Deserialize, Serialize};

/// 저장된 에이전트 정의(정적). status/lastActivity는 런타임 파생값이라 여기 없다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub kind: String,
    pub command: String,
    pub branch: String,
    pub worktree_path: String,
    pub worktree_managed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 프로젝트와 소속 에이전트 목록.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub agents: Vec<Agent>,
}
```

- [ ] **Step 3: 저장소 모듈 진입점(빈 골격) 작성**

`src-tauri/src/store/mod.rs` 생성:

```rust
pub mod models;
pub mod repo;

use std::sync::Mutex;
use rusqlite::Connection;

/// SQLite 연결을 감싼 Tauri 관리 상태.
pub struct StoreState(pub Mutex<Connection>);
```

이 시점엔 `repo.rs`가 없어 컴파일되지 않는다. Task 2에서 `repo.rs`를 만든 뒤 함께 컴파일 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/src/store/models.rs src-tauri/src/store/mod.rs
git commit -m "feat: 저장소 의존성(rusqlite, uuid) 및 프로젝트/에이전트 모델 추가"
```

---

### Task 2: 저장소 마이그레이션 및 CRUD

**Files:**
- Create: `src-tauri/src/store/repo.rs`
- Modify: `src-tauri/src/store/mod.rs:1-11` (open/migrate 함수 추가)

**Interfaces:**
- Consumes: `store::models::{Project, Agent}`, `store::StoreState`
- Produces (모두 `repo` 모듈, `conn: &Connection` 첫 인자):
  - `migrate(conn: &Connection) -> rusqlite::Result<()>`
  - `list_projects(conn) -> rusqlite::Result<Vec<Project>>`
  - `insert_project(conn, name: &str, path: &str, now: i64) -> rusqlite::Result<Project>`
  - `delete_project(conn, id: &str) -> rusqlite::Result<()>`
  - `insert_agent(conn, a: &Agent) -> rusqlite::Result<()>`
  - `get_agent(conn, id: &str) -> rusqlite::Result<Option<Agent>>`
  - `delete_agent(conn, id: &str) -> rusqlite::Result<()>`

- [ ] **Step 1: 마이그레이션 + CRUD 테스트 작성**

`src-tauri/src/store/repo.rs` 생성 (하단에 테스트 포함):

```rust
use rusqlite::{params, Connection};
use crate::store::models::{Agent, Project};

/// 스키마 마이그레이션. user_version PRAGMA로 버전을 관리한다.
pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE agents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                kind TEXT NOT NULL,
                command TEXT NOT NULL,
                branch TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                worktree_managed INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            PRAGMA user_version = 1;",
        )?;
    }
    Ok(())
}

fn row_to_agent(row: &rusqlite::Row) -> rusqlite::Result<Agent> {
    Ok(Agent {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        kind: row.get("kind")?,
        command: row.get("command")?,
        branch: row.get("branch")?,
        worktree_path: row.get("worktree_path")?,
        worktree_managed: row.get::<_, i64>("worktree_managed")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut pstmt = conn.prepare(
        "SELECT id, name, path, created_at, updated_at FROM projects ORDER BY created_at",
    )?;
    let projects: Vec<Project> = pstmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get("id")?,
                name: row.get("name")?,
                path: row.get("path")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
                agents: Vec::new(),
            })
        })?
        .collect::<rusqlite::Result<_>>()?;

    let mut astmt = conn.prepare(
        "SELECT id, project_id, title, kind, command, branch, worktree_path,
                worktree_managed, created_at, updated_at
         FROM agents WHERE project_id = ?1 ORDER BY created_at",
    )?;
    let mut result = Vec::with_capacity(projects.len());
    for mut p in projects {
        p.agents = astmt
            .query_map(params![p.id], row_to_agent)?
            .collect::<rusqlite::Result<_>>()?;
        result.push(p);
    }
    Ok(result)
}

pub fn insert_project(conn: &Connection, name: &str, path: &str, now: i64) -> rusqlite::Result<Project> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO projects (id, name, path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, path, now],
    )?;
    Ok(Project { id, name: name.into(), path: path.into(), created_at: now, updated_at: now, agents: Vec::new() })
}

pub fn delete_project(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_agent(conn: &Connection, a: &Agent) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO agents (id, project_id, title, kind, command, branch,
            worktree_path, worktree_managed, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![a.id, a.project_id, a.title, a.kind, a.command, a.branch,
            a.worktree_path, a.worktree_managed as i64, a.created_at, a.updated_at],
    )?;
    Ok(())
}

pub fn get_agent(conn: &Connection, id: &str) -> rusqlite::Result<Option<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, kind, command, branch, worktree_path,
                worktree_managed, created_at, updated_at FROM agents WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_agent)?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn delete_agent(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn sample_agent(project_id: &str) -> Agent {
        Agent {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.into(),
            title: "테스트 에이전트".into(),
            kind: "codex".into(),
            command: "codex".into(),
            branch: "feat/x".into(),
            worktree_path: "/tmp/wt".into(),
            worktree_managed: true,
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn insert_and_list_roundtrip() {
        let conn = mem();
        let p = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
        insert_agent(&conn, &sample_agent(&p.id)).unwrap();
        let projects = list_projects(&conn).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].agents.len(), 1);
        assert_eq!(projects[0].agents[0].command, "codex");
        assert!(projects[0].agents[0].worktree_managed);
    }

    #[test]
    fn delete_project_cascades_agents() {
        let conn = mem();
        let p = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
        let a = sample_agent(&p.id);
        insert_agent(&conn, &a).unwrap();
        delete_project(&conn, &p.id).unwrap();
        assert!(get_agent(&conn, &a.id).unwrap().is_none());
        assert_eq!(list_projects(&conn).unwrap().len(), 0);
    }
}
```

- [ ] **Step 2: `store/mod.rs`에 open/migrate 헬퍼 추가**

`src-tauri/src/store/mod.rs`를 다음으로 교체:

```rust
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
```

- [ ] **Step 3: 테스트 실행 (실패 → 통과 확인)**

Run: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml store::`
Expected: `insert_and_list_roundtrip`, `delete_project_cascades_agents` 2 passed. (CASCADE는 `PRAGMA foreign_keys = ON` 덕에 동작)

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/store/
git commit -m "feat: SQLite 마이그레이션 및 프로젝트/에이전트 CRUD 구현"
```

---

### Task 3: git worktree 생성/삭제/변경검사

**Files:**
- Modify: `src-tauri/src/git/mod.rs` (함수 3개 + 테스트 추가)

**Interfaces:**
- Consumes: 기존 `run_git`, `run_git_allow_fail`
- Produces:
  - `create_worktree(repo_path: &str, branch: &str, start_point: &str, worktree_path: &str) -> Result<String, String>` — 생성된 worktree 절대경로 반환
  - `remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String>`
  - `worktree_has_changes(worktree_path: &str) -> Result<bool, String>`
  - 에러 판별용 상수: `pub const ERR_WORKTREE_DIRTY: &str = "WORKTREE_DIRTY";`

- [ ] **Step 1: 테스트 작성**

`src-tauri/src/git/mod.rs` 맨 아래에 추가:

```rust
#[cfg(test)]
mod worktree_tests {
    use super::*;
    use std::process::Command;

    /// 커밋 1개가 있는 임시 git 저장소를 만든다.
    fn temp_repo() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wt-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        for args in [
            vec!["init", "-b", "main"],
            vec!["config", "user.email", "t@t.com"],
            vec!["config", "user.name", "t"],
        ] {
            Command::new("git").args(&args).current_dir(p).output().unwrap();
        }
        std::fs::write(dir.join("README.md"), "hi").unwrap();
        Command::new("git").args(["add", "."]).current_dir(p).output().unwrap();
        Command::new("git").args(["commit", "-m", "init"]).current_dir(p).output().unwrap();
        dir
    }

    #[test]
    fn create_new_branch_worktree() {
        let repo = temp_repo();
        let wt = repo.join("..").join(format!("wt-{}", uuid::Uuid::new_v4()));
        let wt_str = wt.to_str().unwrap();
        let created = create_worktree(repo.to_str().unwrap(), "feat/new", "main", wt_str).unwrap();
        assert!(std::path::Path::new(&created).join("README.md").exists());
        // 정리
        remove_worktree(repo.to_str().unwrap(), &created, true).unwrap();
    }

    #[test]
    fn remove_refuses_dirty_without_force() {
        let repo = temp_repo();
        let wt = repo.join("..").join(format!("wt-{}", uuid::Uuid::new_v4()));
        let wt_str = wt.to_str().unwrap();
        let created = create_worktree(repo.to_str().unwrap(), "feat/d", "main", wt_str).unwrap();
        std::fs::write(std::path::Path::new(&created).join("dirty.txt"), "x").unwrap();
        assert!(worktree_has_changes(&created).unwrap());
        let err = remove_worktree(repo.to_str().unwrap(), &created, false).unwrap_err();
        assert_eq!(err, ERR_WORKTREE_DIRTY);
        // force로 정리
        remove_worktree(repo.to_str().unwrap(), &created, true).unwrap();
    }
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml git::worktree_tests`
Expected: 컴파일 실패 (`create_worktree` 등 미정의)

- [ ] **Step 3: 함수 구현**

`src-tauri/src/git/mod.rs`의 `use std::process::Command;` 아래에 추가:

```rust
/// worktree에 uncommitted 변경이 있어 remove가 거부됐음을 나타내는 판별 문자열.
pub const ERR_WORKTREE_DIRTY: &str = "WORKTREE_DIRTY";

/// 새 브랜치로 worktree를 생성한다. branch가 이미 있으면 -b 없이 붙인다.
/// 생성된 worktree의 절대경로를 반환한다.
pub fn create_worktree(
    repo_path: &str,
    branch: &str,
    start_point: &str,
    worktree_path: &str,
) -> Result<String, String> {
    // 브랜치 존재 여부 확인 (rev-parse는 없으면 non-zero)
    let exists = run_git_allow_fail(
        repo_path,
        &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")],
    )
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);

    if exists {
        run_git(repo_path, &["worktree", "add", worktree_path, branch])?;
    } else {
        run_git(repo_path, &["worktree", "add", "-b", branch, worktree_path, start_point])?;
    }
    // 절대경로 정규화
    let abs = std::fs::canonicalize(worktree_path)
        .map_err(|e| format!("worktree 경로 확인 실패: {e}"))?;
    Ok(abs.to_string_lossy().into_owned())
}

/// worktree를 제거한다. force=false에서 uncommitted 변경으로 실패하면 ERR_WORKTREE_DIRTY를 반환한다.
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(worktree_path);
    match run_git(repo_path, &args) {
        Ok(_) => Ok(()),
        Err(e) => {
            if !force && (e.contains("contains modified") || e.contains("is dirty") || e.contains("use --force")) {
                Err(ERR_WORKTREE_DIRTY.to_string())
            } else {
                Err(e)
            }
        }
    }
}

/// worktree에 uncommitted 변경(추적/미추적 포함)이 있는지 확인한다.
pub fn worktree_has_changes(worktree_path: &str) -> Result<bool, String> {
    let out = run_git(worktree_path, &["status", "--porcelain"])?;
    Ok(!out.trim().is_empty())
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml git::worktree_tests`
Expected: `create_new_branch_worktree`, `remove_refuses_dirty_without_force` 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/git/mod.rs
git commit -m "feat: git worktree 생성/삭제/변경검사 함수 추가"
```

---

### Task 4: 프로젝트/에이전트 Tauri 커맨드

**Files:**
- Modify: `src-tauri/src/commands.rs` (커맨드 추가)
- Modify: `src-tauri/src/lib.rs` (모듈/State/핸들러 등록)

**Interfaces:**
- Consumes: `store::{StoreState, open, repo, models::*}`, `git::{create_worktree, remove_worktree, worktree_has_changes, ERR_WORKTREE_DIRTY}`, `pty::now_ms`
- Produces (Tauri 커맨드, camelCase 인자):
  - `list_projects() -> Vec<Project>`
  - `create_project(name, path) -> Project`
  - `delete_project(id)`
  - `create_agent(projectId, projectPath, title, kind, command, branch, startPoint, worktreePath: Option<String>) -> Agent`
  - `delete_agent(id, removeWorktree: bool, force: bool)`
  - `agent_worktree_has_changes(id) -> bool`

- [ ] **Step 1: 커맨드 구현**

`src-tauri/src/commands.rs` 상단 `use` 블록에 추가:

```rust
use crate::store::{self, models::{Agent, Project}, StoreState};
use crate::git;
use crate::pty::now_ms;
```

파일 하단에 커맨드 추가:

```rust
#[tauri::command]
pub fn list_projects(store: tauri::State<'_, StoreState>) -> Result<Vec<Project>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(
    store: tauri::State<'_, StoreState>,
    name: String,
    path: String,
) -> Result<Project, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::insert_project(&conn, &name, &path, now_ms()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(
    store: tauri::State<'_, StoreState>,
    id: String,
) -> Result<(), String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    // managed worktree 정리: 프로젝트 하위 에이전트를 조회해 정리 후 프로젝트 삭제.
    let projects = store::repo::list_projects(&conn).map_err(|e| e.to_string())?;
    if let Some(p) = projects.into_iter().find(|p| p.id == id) {
        for a in &p.agents {
            if a.worktree_managed {
                let _ = git::remove_worktree(&p.path, &a.worktree_path, true);
            }
        }
    }
    store::repo::delete_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_agent(
    store: tauri::State<'_, StoreState>,
    app: tauri::AppHandle,
    project_id: String,
    project_path: String,
    title: String,
    kind: String,
    command: String,
    branch: String,
    start_point: String,
    worktree_path: Option<String>,
) -> Result<Agent, String> {
    use tauri::Manager;
    // worktree 경로 결정: 미지정 시 app_data_dir/worktrees/<project_id>/<branch>
    let (wt_path, managed) = match worktree_path {
        Some(p) if !p.trim().is_empty() => (p, false),
        _ => {
            let base = app.path().app_data_dir().map_err(|e| e.to_string())?
                .join("worktrees").join(&project_id).join(&branch);
            (base.to_string_lossy().into_owned(), true)
        }
    };

    // 1) worktree 생성
    let created = git::create_worktree(&project_path, &branch, &start_point, &wt_path)?;

    // 2) DB insert (실패 시 worktree 롤백)
    let now = now_ms();
    let agent = Agent {
        id: uuid::Uuid::new_v4().to_string(),
        project_id,
        title,
        kind,
        command,
        branch,
        worktree_path: created.clone(),
        worktree_managed: managed,
        created_at: now,
        updated_at: now,
    };
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    if let Err(e) = store::repo::insert_agent(&conn, &agent) {
        let _ = git::remove_worktree(&project_path, &created, true);
        return Err(e.to_string());
    }
    Ok(agent)
}

#[tauri::command]
pub fn agent_worktree_has_changes(
    store: tauri::State<'_, StoreState>,
    id: String,
) -> Result<bool, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    match store::repo::get_agent(&conn, &id).map_err(|e| e.to_string())? {
        Some(a) => git::worktree_has_changes(&a.worktree_path),
        None => Ok(false),
    }
}

#[tauri::command]
pub fn delete_agent(
    store: tauri::State<'_, StoreState>,
    id: String,
    remove_worktree: bool,
    force: bool,
) -> Result<(), String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    let agent = store::repo::get_agent(&conn, &id).map_err(|e| e.to_string())?;
    if let Some(a) = &agent {
        if remove_worktree && a.worktree_managed {
            // repo_path는 worktree 자체 경로로도 git worktree remove가 동작(공통 .git 참조).
            git::remove_worktree(&a.worktree_path, &a.worktree_path, force)?;
        }
    }
    store::repo::delete_agent(&conn, &id).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: lib.rs 등록**

`src-tauri/src/lib.rs`를 수정:

`mod commands;` 아래에 `mod store;` 추가. `use tauri::Manager;`는 이미 있음. `.setup()` 클로저 안, poller spawn 뒤에 DB 초기화 추가:

```rust
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
```

`invoke_handler`의 `generate_handler!` 목록에 추가:

```rust
commands::list_projects,
commands::create_project,
commands::delete_project,
commands::create_agent,
commands::delete_agent,
commands::agent_worktree_has_changes,
```

- [ ] **Step 3: 컴파일 확인**

Run: `mise exec -- cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 컴파일 성공.

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 프로젝트/에이전트 Tauri 커맨드 및 저장소 초기화 등록"
```

---

### Task 5: 타입 변경 및 라벨 상수 분리

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/data/labels.ts`
- Delete: `src/lib/data/mock.ts`
- Modify: `src/lib/components/shell/Sidebar.svelte:4`, `MainPanel.svelte:6`, `StatusDot.svelte:2` (import 경로)

**Interfaces:**
- Produces:
  - `types.Agent`에 `command: string` 추가. `status`, `lastActivity`는 선택적(`status?: AgentStatus; lastActivity?: string`)으로 변경 — 런타임 병합 전엔 없을 수 있음.
  - `labels.ts`: `agentKindLabels`, `statusLabels`, `agentKindDefaults: Record<AgentKind, string>`

- [ ] **Step 1: 타입 수정**

`src/lib/types.ts`의 `Agent` 인터페이스를 수정:

```typescript
export interface Agent {
  id: string;
  projectId: string;
  /** 사용자가 붙인 작업 이름 (예: "로그인 리팩터링") */
  title: string;
  kind: AgentKind;
  /** 실행 커맨드 (예: "claude", "codex --model o3") */
  command: string;
  /** 격리된 git worktree의 브랜치명 */
  branch: string;
  /** 격리된 git worktree의 로컬 경로. diff 계산의 기준이 된다. */
  worktreePath: string;
  /** 앱이 자동 생성한 worktree면 true (삭제 시 정리 대상) */
  worktreeManaged: boolean;
  /** 런타임 파생: 3계층 트래킹이 판별하는 실행 상태. 미실행 시 idle. */
  status?: AgentStatus;
  /** 런타임 파생: 마지막 활동 상대 시간 표기 */
  lastActivity?: string;
}
```

`Project` 인터페이스에 `createdAt`/`updatedAt` 추가:

```typescript
export interface Project {
  id: string;
  name: string;
  /** 로컬 저장소 경로 */
  path: string;
  createdAt: number;
  updatedAt: number;
  agents: Agent[];
}
```

- [ ] **Step 2: labels.ts 생성**

`src/lib/data/labels.ts` 생성:

```typescript
import type { AgentKind, AgentStatus } from "$lib/types";

export const agentKindLabels: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
};

export const statusLabels: Record<AgentStatus, string> = {
  running: "실행 중",
  idle: "대기",
  blocked: "입력 대기",
  done: "완료",
};

/** kind 선택 시 실행 커맨드 입력란에 자동으로 채워지는 기본값. */
export const agentKindDefaults: Record<AgentKind, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini",
};
```

- [ ] **Step 3: mock.ts 삭제 및 import 경로 갱신**

```bash
git rm src/lib/data/mock.ts
```

세 컴포넌트의 import를 `$lib/data/mock` → `$lib/data/labels`로 변경:
- `src/lib/components/shell/Sidebar.svelte:4`: `import { agentKindLabels } from "$lib/data/labels";`
- `src/lib/components/shell/MainPanel.svelte:6`: `import { agentKindLabels, statusLabels } from "$lib/data/labels";`
- `src/lib/components/shell/StatusDot.svelte:2`: `import { statusLabels } from "$lib/data/labels";`

- [ ] **Step 4: 타입 체크 (이 시점엔 App.svelte가 아직 깨져 있음)**

Run: `pnpm check 2>&1 | grep -E "labels|mock" || echo "labels/mock 관련 에러 없음"`
Expected: labels/mock import 관련 에러 없음. (App.svelte의 `mockProjects` 에러는 Task 7에서 해소)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/types.ts src/lib/data/labels.ts src/lib/components/shell/
git commit -m "refactor: 라벨 상수를 labels.ts로 분리하고 Agent 타입에 command 추가"
```

---

### Task 6: IPC 래퍼 및 UI 설정 스토어

**Files:**
- Create: `src/lib/ipc/projects.ts`
- Create: `src/lib/stores/uiSettings.svelte.ts`

**Interfaces:**
- Produces:
  - `ipc/projects.ts`: `listProjects()`, `createProject(name, path)`, `deleteProject(id)`, `createAgent(opts)`, `deleteAgent(id, removeWorktree, force)`, `agentWorktreeHasChanges(id)`
  - `CreateAgentOptions { projectId, projectPath, title, kind, command, branch, startPoint, worktreePath?: string }`
  - `uiSettings.svelte.ts`: `uiSettings` 객체 with `skipWorktreeDeletePrompt` getter/setter (localStorage 영속)

- [ ] **Step 1: IPC 래퍼 작성**

`src/lib/ipc/projects.ts` 생성:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { AgentKind, Agent, Project } from "$lib/types";

export function listProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

export function createProject(name: string, path: string): Promise<Project> {
  return invoke<Project>("create_project", { name, path });
}

export function deleteProject(id: string): Promise<void> {
  return invoke("delete_project", { id });
}

export interface CreateAgentOptions {
  projectId: string;
  projectPath: string;
  title: string;
  kind: AgentKind;
  command: string;
  branch: string;
  startPoint: string;
  worktreePath?: string;
}

export function createAgent(opts: CreateAgentOptions): Promise<Agent> {
  return invoke<Agent>("create_agent", {
    projectId: opts.projectId,
    projectPath: opts.projectPath,
    title: opts.title,
    kind: opts.kind,
    command: opts.command,
    branch: opts.branch,
    startPoint: opts.startPoint,
    worktreePath: opts.worktreePath ?? null,
  });
}

export function deleteAgent(id: string, removeWorktree: boolean, force: boolean): Promise<void> {
  return invoke("delete_agent", { id, removeWorktree, force });
}

export function agentWorktreeHasChanges(id: string): Promise<boolean> {
  return invoke<boolean>("agent_worktree_has_changes", { id });
}
```

- [ ] **Step 2: UI 설정 스토어 작성**

`src/lib/stores/uiSettings.svelte.ts` 생성 (기존 theme/terminalSettings의 localStorage 패턴 준용):

```typescript
const KEY = "ui:skip-worktree-delete-prompt";

class UiSettings {
  #skip = $state(false);

  constructor() {
    if (typeof localStorage !== "undefined") {
      this.#skip = localStorage.getItem(KEY) === "true";
    }
  }

  get skipWorktreeDeletePrompt(): boolean {
    return this.#skip;
  }

  set skipWorktreeDeletePrompt(v: boolean) {
    this.#skip = v;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, String(v));
    }
  }
}

export const uiSettings = new UiSettings();
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm check 2>&1 | grep -E "projects.ts|uiSettings" || echo "신규 파일 타입 에러 없음"`
Expected: 신규 파일 타입 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/ipc/projects.ts src/lib/stores/uiSettings.svelte.ts
git commit -m "feat: 프로젝트/에이전트 IPC 래퍼 및 worktree 삭제 확인 설정 추가"
```

---

### Task 7: 프로젝트 스토어 (목데이터 대체)

**Files:**
- Create: `src/lib/stores/projects.svelte.ts`
- Create: `src/lib/stores/projects.svelte.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `ipc/projects.*`, `sessionStatus`, `types.{Project, Agent}`
- Produces:
  - `projectStore` with: `projects: Project[]` (getter, sessionStatus 병합된 status 포함), `load()`, `addProject(name, path)`, `removeProject(id)`, `addAgent(opts)`, `removeAgent(id, removeWorktree, force)`

- [ ] **Step 1: 스토어 테스트 작성**

`src/lib/stores/projects.svelte.test.ts` 생성:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/ipc/projects", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  agentWorktreeHasChanges: vi.fn(),
}));

import * as ipc from "$lib/ipc/projects";
import { createProjectStore } from "./projects.svelte";

const sampleProject = {
  id: "p1", name: "proj", path: "/tmp/p", createdAt: 1, updatedAt: 1,
  agents: [{ id: "a1", projectId: "p1", title: "t", kind: "codex" as const,
    command: "codex", branch: "b", worktreePath: "/tmp/w", worktreeManaged: true }],
};

describe("projectStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("load()가 IPC 결과로 projects를 채운다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    const store = createProjectStore();
    await store.load();
    expect(store.projects).toHaveLength(1);
    expect(store.projects[0].agents[0].command).toBe("codex");
  });

  it("addProject()가 생성된 프로젝트를 목록에 추가한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([]);
    (ipc.createProject as any).mockResolvedValue({ ...sampleProject, agents: [] });
    const store = createProjectStore();
    await store.load();
    await store.addProject("proj", "/tmp/p");
    expect(store.projects).toHaveLength(1);
  });

  it("removeAgent()가 해당 에이전트를 목록에서 제거한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteAgent as any).mockResolvedValue(undefined);
    const store = createProjectStore();
    await store.load();
    await store.removeAgent("a1", true, false);
    expect(store.projects[0].agents).toHaveLength(0);
    expect(ipc.deleteAgent).toHaveBeenCalledWith("a1", true, false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test projects.svelte`
Expected: FAIL (`createProjectStore` 미정의)

- [ ] **Step 3: 스토어 구현**

`src/lib/stores/projects.svelte.ts` 생성:

```typescript
import type { Project } from "$lib/types";
import * as ipc from "$lib/ipc/projects";
import type { CreateAgentOptions } from "$lib/ipc/projects";
import { sessionStatus } from "$lib/stores/sessions.svelte";

export function createProjectStore() {
  let projects = $state<Project[]>([]);

  // sessionStatus(런타임)를 병합해 표시용 status를 채운 목록.
  const withStatus = (): Project[] =>
    projects.map((p) => ({
      ...p,
      agents: p.agents.map((a) => ({
        ...a,
        status: sessionStatus.get(a.id) ?? a.status ?? "idle",
      })),
    }));

  return {
    get projects(): Project[] {
      return withStatus();
    },
    async load(): Promise<void> {
      projects = await ipc.listProjects();
    },
    async addProject(name: string, path: string): Promise<void> {
      const p = await ipc.createProject(name, path);
      projects = [...projects, p];
    },
    async removeProject(id: string): Promise<void> {
      await ipc.deleteProject(id);
      projects = projects.filter((p) => p.id !== id);
    },
    async addAgent(opts: CreateAgentOptions): Promise<void> {
      const agent = await ipc.createAgent(opts);
      projects = projects.map((p) =>
        p.id === opts.projectId ? { ...p, agents: [...p.agents, agent] } : p,
      );
    },
    async removeAgent(id: string, removeWorktree: boolean, force: boolean): Promise<void> {
      await ipc.deleteAgent(id, removeWorktree, force);
      projects = projects.map((p) => ({
        ...p,
        agents: p.agents.filter((a) => a.id !== id),
      }));
    },
  };
}

export const projectStore = createProjectStore();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test projects.svelte`
Expected: 3 passed.

- [ ] **Step 5: App.svelte에서 목데이터 제거**

`src/App.svelte`를 수정. `import { mockProjects } from "$lib/data/mock";` 제거하고:

```svelte
  import { projectStore } from "$lib/stores/projects.svelte";
```

`const projects = mockProjects;`를 제거. `projects`를 참조하던 부분을 `projectStore.projects`로 교체:

```svelte
  let selectedAgentId = $state("");

  const selectedAgent = $derived<Agent | undefined>(
    projectStore.projects.flatMap((p) => p.agents).find((a) => a.id === selectedAgentId),
  );
```

`onMount`에서 스토어 로드 추가:

```svelte
  onMount(() => {
    sessionStatus.start();
    projectStore.load();
  });
```

`<Sidebar {projects} ... />`를 `<Sidebar projects={projectStore.projects} ... />`로 변경.

- [ ] **Step 6: 타입 체크**

Run: `pnpm check`
Expected: 에러 없음 (mockProjects 참조 사라짐).

- [ ] **Step 7: 커밋**

```bash
git add src/lib/stores/projects.svelte.ts src/lib/stores/projects.svelte.test.ts src/App.svelte
git commit -m "feat: 프로젝트 스토어로 목데이터 대체 및 앱 마운트 시 로드"
```

---

### Task 8: 프로젝트/에이전트 추가 다이얼로그

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml` (plugin-dialog)
- Modify: `src-tauri/src/lib.rs` (plugin-dialog 등록)
- Create: `src/lib/components/shell/ProjectDialog.svelte`
- Create: `src/lib/components/shell/AgentDialog.svelte`
- Modify: `src/lib/components/shell/Sidebar.svelte` (추가 진입점)

**Interfaces:**
- Consumes: `projectStore.addProject/addAgent`, `agentKindDefaults`, `@tauri-apps/plugin-dialog` `open`
- Produces: `ProjectDialog`, `AgentDialog` (bindable `open` prop 패턴)

- [ ] **Step 1: plugin-dialog 설치**

```bash
pnpm add @tauri-apps/plugin-dialog
```

`src-tauri/Cargo.toml` `[dependencies]`에 추가:

```toml
tauri-plugin-dialog = "2"
```

`src-tauri/src/lib.rs`의 빌더에 `.plugin(tauri_plugin_dialog::init())` 추가 (opener plugin 옆).

- [ ] **Step 2: ProjectDialog 작성**

`src/lib/components/shell/ProjectDialog.svelte` 생성. 기존 `SettingsDialog.svelte`의 shadcn Dialog 패턴을 따른다:

```svelte
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { projectStore } from "$lib/stores/projects.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state("");
  let path = $state("");
  let error = $state("");

  async function pickDir() {
    const selected = await openDialog({ directory: true });
    if (typeof selected === "string") {
      path = selected;
      if (!name) name = selected.split("/").pop() ?? "";
    }
  }

  async function submit() {
    error = "";
    try {
      await projectStore.addProject(name.trim(), path.trim());
      open = false;
      name = "";
      path = "";
    } catch (e) {
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>프로젝트 추가</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="proj-name">이름</Label>
        <Input id="proj-name" bind:value={name} placeholder="프로젝트 이름" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="proj-path">경로</Label>
        <div class="flex gap-2">
          <Input id="proj-path" bind:value={path} placeholder="로컬 저장소 경로" readonly />
          <Button variant="secondary" onclick={pickDir}>선택</Button>
        </div>
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={!name.trim() || !path.trim()}>추가</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: AgentDialog 작성**

`src/lib/components/shell/AgentDialog.svelte` 생성:

```svelte
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindLabels, agentKindDefaults } from "$lib/data/labels";
  import { projectStore } from "$lib/stores/projects.svelte";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let title = $state("");
  let kind = $state<AgentKind>("claude-code");
  let command = $state(agentKindDefaults["claude-code"]);
  let branch = $state("");
  let startPoint = $state("main");
  let worktreePath = $state("");
  let error = $state("");

  // kind 변경 시 command를 해당 기본값으로 자동 채움 (사용자가 이후 수정 가능).
  function onKindChange(v: string) {
    kind = v as AgentKind;
    command = agentKindDefaults[kind];
  }

  async function submit() {
    error = "";
    try {
      await projectStore.addAgent({
        projectId: project.id,
        projectPath: project.path,
        title: title.trim(),
        kind,
        command: command.trim(),
        branch: branch.trim(),
        startPoint: startPoint.trim(),
        worktreePath: worktreePath.trim() || undefined,
      });
      open = false;
      title = ""; branch = ""; worktreePath = "";
    } catch (e) {
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>에이전트 추가 — {project.name}</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="ag-title">작업 이름</Label>
        <Input id="ag-title" bind:value={title} placeholder="예: 로그인 리팩터링" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>종류</Label>
        <Select.Root type="single" value={kind} onValueChange={onKindChange}>
          <Select.Trigger>{agentKindLabels[kind]}</Select.Trigger>
          <Select.Content>
            {#each Object.keys(agentKindLabels) as k (k)}
              <Select.Item value={k}>{agentKindLabels[k as AgentKind]}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-cmd">실행 커맨드</Label>
        <Input id="ag-cmd" bind:value={command} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-branch">브랜치</Label>
        <Input id="ag-branch" bind:value={branch} placeholder="예: feat/login" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-start">분기 기준(start-point)</Label>
        <Input id="ag-start" bind:value={startPoint} placeholder="예: main" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-wt">worktree 경로 (비우면 자동 생성)</Label>
        <Input id="ag-wt" bind:value={worktreePath} placeholder="선택 사항" />
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={!title.trim() || !branch.trim() || !startPoint.trim() || !command.trim()}>
        추가
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 4: Sidebar에 추가 진입점 연결**

`src/lib/components/shell/Sidebar.svelte`를 수정. 스크립트에 import 추가:

```svelte
  import { Button } from "$lib/components/ui/button";
  import Plus from "@lucide/svelte/icons/plus";
  import ProjectDialog from "./ProjectDialog.svelte";
  import AgentDialog from "./AgentDialog.svelte";
```

다이얼로그 상태 선언은 이 Step 뒷부분의 "확정" 블록에서 함께 정의한다(`projectDialogOpen`, `agentDialogFor`, `agentDialogOpen`, `openAgentDialog`). 헤더 영역(`프로젝트 & 에이전트` span 옆)에 프로젝트 추가 버튼 추가:

```svelte
  <div class="flex h-9 items-center px-3">
    <span class="text-xs font-medium text-muted-foreground">프로젝트 & 에이전트</span>
    <Button variant="ghost" size="icon" class="ml-auto size-6" onclick={() => (projectDialogOpen = true)}>
      <Plus class="size-3.5" />
    </Button>
  </div>
```

각 프로젝트 헤더에 에이전트 추가 버튼 추가(프로젝트 name span 옆, 에이전트 카운트 앞):

```svelte
  <button type="button" class="ml-auto rounded p-0.5 hover:bg-sidebar-accent"
    onclick={() => openAgentDialog(project)}>
    <Plus class="size-3 text-muted-foreground" />
  </button>
  <span class="text-[10px] text-muted-foreground">{project.agents.length}</span>
```

에이전트 다이얼로그는 열림 상태(`agentDialogOpen`)와 대상 프로젝트(`agentDialogFor`)를 분리해 관리한다. 스크립트의 상태 선언을 다음으로 확정:

```svelte
  let projectDialogOpen = $state(false);
  let agentDialogFor = $state<Project | null>(null);
  let agentDialogOpen = $state(false);

  function openAgentDialog(p: Project) {
    agentDialogFor = p;
    agentDialogOpen = true;
  }
  // 다이얼로그가 닫히면 대상 프로젝트도 정리
  $effect(() => {
    if (!agentDialogOpen) agentDialogFor = null;
  });
```

에이전트 추가 버튼 onclick을 `() => openAgentDialog(project)`로 지정한다(Step의 프로젝트 헤더 버튼 참조).

컴포넌트 최상위 마크업 끝에 다이얼로그 배치:

```svelte
<ProjectDialog bind:open={projectDialogOpen} />
{#if agentDialogFor}
  <AgentDialog bind:open={agentDialogOpen} project={agentDialogFor} />
{/if}
```

- [ ] **Step 5: 타입 체크 + 빌드**

Run: `pnpm check`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/src/lib.rs src/lib/components/shell/
git commit -m "feat: 프로젝트/에이전트 추가 다이얼로그 및 디렉토리 선택 도입"
```

---

### Task 9: 에이전트 삭제 확인 다이얼로그 및 PTY 실행 연결

**Files:**
- Create: `src/lib/components/shell/DeleteAgentDialog.svelte`
- Modify: `src/lib/components/shell/Sidebar.svelte` (삭제 진입점)
- Modify: `src/lib/components/shell/MainPanel.svelte` (PTY 실행 연결)

**Interfaces:**
- Consumes: `projectStore.removeAgent`, `ipc.agentWorktreeHasChanges`, `uiSettings.skipWorktreeDeletePrompt`, `types.Agent`
- Produces: `DeleteAgentDialog` (bindable `open`, `agent` prop)

- [ ] **Step 1: DeleteAgentDialog 작성**

`src/lib/components/shell/DeleteAgentDialog.svelte` 생성:

```svelte
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { agentWorktreeHasChanges } from "$lib/ipc/projects";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";

  let { open = $bindable(false), agent }: { open?: boolean; agent: Agent } = $props();

  let hasChanges = $state(false);
  let dontAskAgain = $state(false);
  let error = $state("");

  // 다이얼로그가 열릴 때 변경 유무 조회
  $effect(() => {
    if (open && agent) {
      agentWorktreeHasChanges(agent.id).then((v) => (hasChanges = v)).catch(() => (hasChanges = false));
    }
  });

  async function confirm(force: boolean) {
    error = "";
    try {
      await projectStore.removeAgent(agent.id, agent.worktreeManaged, force);
      if (dontAskAgain) uiSettings.skipWorktreeDeletePrompt = true;
      open = false;
    } catch (e) {
      // WORKTREE_DIRTY면 강제 삭제 재확인은 버튼으로 처리
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>에이전트 삭제</Dialog.Title>
      <Dialog.Description>
        "{agent.title}"을(를) 삭제합니다.
        {#if agent.worktreeManaged}
          앱이 생성한 worktree({agent.branch})도 함께 제거됩니다.
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if hasChanges}
      <p class="text-xs text-amber-600">이 worktree에 커밋되지 않은 변경사항이 있습니다.</p>
    {/if}
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}
    <div class="flex items-center gap-2 py-1">
      <Checkbox id="dont-ask" bind:checked={dontAskAgain} />
      <Label for="dont-ask" class="text-xs">다음부터 묻지 않고 자동으로 안전 제거</Label>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>취소</Button>
      {#if hasChanges}
        <Button variant="destructive" onclick={() => confirm(true)}>강제 삭제</Button>
      {:else}
        <Button variant="destructive" onclick={() => confirm(false)}>삭제</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 2: Sidebar에 삭제 진입점 연결**

`src/lib/components/shell/Sidebar.svelte`에 삭제 다이얼로그 상태와 진입점 추가:

```svelte
  import DeleteAgentDialog from "./DeleteAgentDialog.svelte";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import Trash from "@lucide/svelte/icons/trash-2";

  let deleteAgentTarget = $state<Agent | null>(null);
  let deleteDialogOpen = $state(false);

  async function requestDeleteAgent(agent: Agent) {
    // "묻지 않기"가 설정돼 있으면 팝업 없이 안전 제거(force=false)
    if (uiSettings.skipWorktreeDeletePrompt) {
      await projectStore.removeAgent(agent.id, agent.worktreeManaged, false);
      return;
    }
    deleteAgentTarget = agent;
    deleteDialogOpen = true;
  }

  $effect(() => {
    if (!deleteDialogOpen) deleteAgentTarget = null;
  });
```

각 에이전트 버튼 옆(hover 시 노출)에 삭제 아이콘 버튼 추가. 에이전트 카드 마크업을 감싸는 구조에 삭제 트리거를 넣되, 카드 클릭(select)과 충돌하지 않도록 별도 버튼으로:

```svelte
  <div class="group relative flex items-center">
    <button type="button" onclick={() => onSelect(agent)} class="...기존 클래스...">
      <!-- 기존 에이전트 카드 내용 -->
    </button>
    <button type="button"
      class="absolute right-1 hidden rounded p-1 group-hover:block hover:bg-destructive/10"
      onclick={() => requestDeleteAgent(agent)}>
      <Trash class="size-3 text-muted-foreground" />
    </button>
  </div>
```

`projectStore`를 Sidebar에서 쓰므로 import 추가: `import { projectStore } from "$lib/stores/projects.svelte";`

마크업 끝에 다이얼로그 배치:

```svelte
{#if deleteAgentTarget}
  <DeleteAgentDialog bind:open={deleteDialogOpen} agent={deleteAgentTarget} />
{/if}
```

- [ ] **Step 3: MainPanel PTY 실행 연결**

`src/lib/components/shell/MainPanel.svelte`에서 `defaultShell()` 함수를 제거하고, Terminal에 에이전트의 실제 command/worktreePath 연결:

```svelte
      <Tabs.Content value="terminal" class="min-h-0 flex-1 p-2">
        {#key agent.id}
          <div class="h-full w-full overflow-hidden rounded-lg border bg-black p-1">
            <Terminal
              sessionId={agent.id}
              cmd={agent.command}
              cwd={agent.worktreePath}
            />
          </div>
        {/key}
      </Tabs.Content>
```

`status`가 이제 optional이므로 헤더의 `agent.status` 참조를 `agent.status ?? "idle"`로 보정:

```svelte
      <StatusDot status={agent.status ?? "idle"} />
      ...
      <Badge variant="secondary" class="ml-auto shrink-0">
        {statusLabels[agent.status ?? "idle"]}
      </Badge>
```

- [ ] **Step 4: checkbox 컴포넌트 존재 확인**

Run: `ls src/lib/components/ui/checkbox 2>/dev/null && echo OK || echo "MISSING - shadcn checkbox 추가 필요"`
Expected: OK. MISSING이면 `pnpm dlx shadcn-svelte@latest add checkbox`로 추가 후 커밋에 포함.

- [ ] **Step 5: 타입 체크**

Run: `pnpm check`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/components/shell/
git commit -m "feat: 에이전트 삭제 확인 다이얼로그 및 실제 커맨드/worktree PTY 실행 연결"
```

---

### Task 10: 통합 검증 및 회귀 확인

**Files:** (수정 없음 — 검증 전용)

- [ ] **Step 1: 전체 프론트 테스트**

Run: `pnpm test`
Expected: 기존 + 신규(`projects.svelte.test.ts`) 모두 통과.

- [ ] **Step 2: 전체 Rust 테스트**

Run: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml`
Expected: store/git 테스트 모두 통과.

- [ ] **Step 3: 타입 체크 + 프로덕션 빌드**

Run: `pnpm check && pnpm build`
Expected: 에러 없음.

- [ ] **Step 4: 목데이터 잔재 확인**

Run: `grep -rn "mockProjects\|data/mock" src/ || echo "잔재 없음"`
Expected: 잔재 없음.

- [ ] **Step 5: 앱 수동 실행 확인 (선택)**

Run: `mise exec -- pnpm tauri dev`
확인: 빈 상태 표시 → 프로젝트 추가(디렉토리 선택) → 에이전트 추가(worktree 자동 생성) → 터미널에 실제 커맨드 실행 → 에이전트 삭제(확인 팝업, worktree 정리).

- [ ] **Step 6: 최종 커밋 (필요 시)**

검증 중 수정이 있었다면 커밋. 없으면 생략.
