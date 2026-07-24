use rusqlite::{params, Connection};
use crate::store::models::{Agent, Checkpoint, Event, Project, Prompt, Task};

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
    if version < 2 {
        // 팬아웃(멀티 에이전트 병렬 실행) 지원: 그룹 식별자와 공유 프롬프트 컬럼.
        conn.execute_batch(
            "ALTER TABLE agents ADD COLUMN group_id TEXT;
             ALTER TABLE agents ADD COLUMN prompt TEXT;
             PRAGMA user_version = 2;",
        )?;
    }
    if version < 3 {
        // 재사용 프롬프트/플레이북 라이브러리.
        conn.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            PRAGMA user_version = 3;",
        )?;
    }
    if version < 4 {
        // worktree 체크포인트(스냅샷) 이력.
        conn.execute_batch(
            "CREATE TABLE checkpoints (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                sha TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            PRAGMA user_version = 4;",
        )?;
    }
    if version < 5 {
        // 크로스 프로젝트 태스크 보드(계획 → 실행 연결).
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                notes TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            PRAGMA user_version = 5;",
        )?;
    }
    if version < 6 {
        // 세션 감사 타임라인(에이전트 활동 이벤트 로그).
        conn.execute_batch(
            "CREATE TABLE events (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX idx_events_agent ON events(agent_id, created_at);
            PRAGMA user_version = 6;",
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
        group_id: row.get("group_id")?,
        prompt: row.get("prompt")?,
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
                worktree_managed, group_id, prompt, created_at, updated_at
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

/// 기본 작업환경 에이전트의 제목. 프로젝트 저장소 본체(메인 워킹트리)에서 동작하는 특수 에이전트다.
pub const DEFAULT_AGENT_TITLE: &str = "기본 작업환경";

/// 프로젝트의 메인 워킹트리(경로 자체)에서 동작하는 기본 작업환경 에이전트를 만든다.
/// 앱이 생성/삭제하는 worktree가 아니라 저장소 본체이므로 worktree_managed는 false다.
fn build_default_agent(
    project_id: &str,
    kind: &str,
    command: &str,
    branch: &str,
    path: &str,
    now: i64,
) -> Agent {
    Agent {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.into(),
        title: DEFAULT_AGENT_TITLE.into(),
        kind: kind.into(),
        command: command.into(),
        branch: branch.into(),
        worktree_path: path.into(),
        worktree_managed: false,
        group_id: None,
        prompt: None,
        created_at: now,
        updated_at: now,
    }
}

pub fn insert_project_with_default_agent(
    conn: &mut Connection,
    name: &str,
    path: &str,
    kind: &str,
    command: &str,
    branch: &str,
    now: i64,
) -> rusqlite::Result<Project> {
    let transaction = conn.transaction()?;
    let mut project = insert_project(&transaction, name, path, now)?;
    let agent = build_default_agent(&project.id, kind, command, branch, path, now);
    insert_agent(&transaction, &agent)?;
    transaction.commit()?;
    project.agents.push(agent);
    Ok(project)
}

/// 기존 프로젝트에 기본 작업환경 에이전트를 다시 추가한다. (기본 작업환경 삭제 후 복구용)
pub fn insert_default_agent(
    conn: &Connection,
    project_id: &str,
    kind: &str,
    command: &str,
    branch: &str,
    path: &str,
    now: i64,
) -> rusqlite::Result<Agent> {
    let agent = build_default_agent(project_id, kind, command, branch, path, now);
    insert_agent(conn, &agent)?;
    Ok(agent)
}

/// 프로젝트 내에 해당 worktree 경로를 사용하는 에이전트가 있는지 확인한다.
pub fn project_has_worktree_agent(
    conn: &Connection,
    project_id: &str,
    worktree_path: &str,
) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE project_id = ?1 AND worktree_path = ?2",
        params![project_id, worktree_path],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn delete_project(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_agent(conn: &Connection, a: &Agent) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO agents (id, project_id, title, kind, command, branch,
            worktree_path, worktree_managed, group_id, prompt, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![a.id, a.project_id, a.title, a.kind, a.command, a.branch,
            a.worktree_path, a.worktree_managed as i64, a.group_id, a.prompt, a.created_at, a.updated_at],
    )?;
    Ok(())
}

pub fn get_agent(conn: &Connection, id: &str) -> rusqlite::Result<Option<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, kind, command, branch, worktree_path,
                worktree_managed, group_id, prompt, created_at, updated_at FROM agents WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_agent)?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

/// 주어진 worktree_path를 사용하는 에이전트 수를 반환한다.
pub fn count_agents_by_worktree(conn: &Connection, worktree_path: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE worktree_path = ?1",
        params![worktree_path],
        |row| row.get(0),
    )
}

/// 삭제될 관리 에이전트를 제외한 다음 참조자에게 worktree 관리 책임을 이전한다.
pub fn transfer_worktree_management(
    conn: &Connection,
    worktree_path: &str,
    excluding_agent_id: &str,
) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        "UPDATE agents SET worktree_managed = 1
         WHERE id = (
             SELECT id FROM agents
             WHERE worktree_path = ?1 AND id <> ?2
             ORDER BY created_at, id
             LIMIT 1
         )",
        params![worktree_path, excluding_agent_id],
    )?;
    Ok(changed > 0)
}

/// 에이전트 삭제와 공유 worktree 관리 책임 이전을 한 트랜잭션으로 처리한다.
pub fn delete_agent_with_worktree_transfer(
    conn: &mut Connection,
    agent: &Agent,
) -> rusqlite::Result<()> {
    let transaction = conn.transaction()?;
    let references = count_agents_by_worktree(&transaction, &agent.worktree_path)?;
    if agent.worktree_managed && references > 1 {
        transfer_worktree_management(&transaction, &agent.worktree_path, &agent.id)?;
    }
    delete_agent(&transaction, &agent.id)?;
    transaction.commit()
}

pub fn delete_agent(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
    Ok(())
}

/// 프롬프트 라이브러리를 최근 갱신 순으로 나열한다.
pub fn list_prompts(conn: &Connection) -> rusqlite::Result<Vec<Prompt>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, body, created_at, updated_at FROM prompts ORDER BY updated_at DESC",
    )?;
    let prompts = stmt
        .query_map([], |row| {
            Ok(Prompt {
                id: row.get("id")?,
                title: row.get("title")?,
                body: row.get("body")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(prompts)
}

/// 프롬프트를 새로 저장한다.
pub fn insert_prompt(conn: &Connection, title: &str, body: &str, now: i64) -> rusqlite::Result<Prompt> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO prompts (id, title, body, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![id, title, body, now],
    )?;
    Ok(Prompt { id, title: title.into(), body: body.into(), created_at: now, updated_at: now })
}

/// 프롬프트의 제목/본문을 갱신한다.
pub fn update_prompt(conn: &Connection, id: &str, title: &str, body: &str, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE prompts SET title = ?2, body = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, title, body, now],
    )?;
    Ok(())
}

/// 프롬프트를 삭제한다.
pub fn delete_prompt(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM prompts WHERE id = ?1", params![id])?;
    Ok(())
}

fn row_to_checkpoint(row: &rusqlite::Row) -> rusqlite::Result<Checkpoint> {
    Ok(Checkpoint {
        id: row.get("id")?,
        agent_id: row.get("agent_id")?,
        label: row.get("label")?,
        sha: row.get("sha")?,
        created_at: row.get("created_at")?,
    })
}

/// 에이전트의 체크포인트를 최신순으로 나열한다.
pub fn list_checkpoints(conn: &Connection, agent_id: &str) -> rusqlite::Result<Vec<Checkpoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, label, sha, created_at FROM checkpoints
         WHERE agent_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(params![agent_id], row_to_checkpoint)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

/// 체크포인트를 저장한다.
pub fn insert_checkpoint(
    conn: &Connection,
    agent_id: &str,
    label: &str,
    sha: &str,
    now: i64,
) -> rusqlite::Result<Checkpoint> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO checkpoints (id, agent_id, label, sha, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![id, agent_id, label, sha, now],
    )?;
    Ok(Checkpoint {
        id,
        agent_id: agent_id.into(),
        label: label.into(),
        sha: sha.into(),
        created_at: now,
    })
}

/// 체크포인트를 삭제한다.
pub fn delete_checkpoint(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM checkpoints WHERE id = ?1", params![id])?;
    Ok(())
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        status: row.get("status")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// 모든 태스크를 생성 순으로 나열한다.
pub fn list_tasks(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, notes, status, created_at, updated_at
         FROM tasks ORDER BY created_at",
    )?;
    let rows = stmt
        .query_map([], row_to_task)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

/// 태스크를 새로 만든다(status는 todo로 시작).
pub fn insert_task(
    conn: &Connection,
    project_id: Option<&str>,
    title: &str,
    notes: &str,
    now: i64,
) -> rusqlite::Result<Task> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tasks (id, project_id, title, notes, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'todo',?5,?5)",
        params![id, project_id, title, notes, now],
    )?;
    Ok(Task {
        id,
        project_id: project_id.map(|p| p.to_string()),
        title: title.into(),
        notes: notes.into(),
        status: "todo".into(),
        created_at: now,
        updated_at: now,
    })
}

/// 태스크의 제목/메모를 수정한다.
pub fn update_task(conn: &Connection, id: &str, title: &str, notes: &str, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tasks SET title = ?2, notes = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, title, notes, now],
    )?;
    Ok(())
}

/// 태스크 상태를 바꾼다.
pub fn set_task_status(conn: &Connection, id: &str, status: &str, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, status, now],
    )?;
    Ok(())
}

/// 태스크를 삭제한다.
pub fn delete_task(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

/// 감사 이벤트를 기록한다.
pub fn insert_event(
    conn: &Connection,
    agent_id: &str,
    kind: &str,
    detail: &str,
    now: i64,
) -> rusqlite::Result<Event> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO events (id, agent_id, kind, detail, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![id, agent_id, kind, detail, now],
    )?;
    Ok(Event {
        id,
        agent_id: agent_id.into(),
        kind: kind.into(),
        detail: detail.into(),
        created_at: now,
    })
}

/// 에이전트의 이벤트를 최신순으로 나열한다(최근 100건).
pub fn list_events(conn: &Connection, agent_id: &str) -> rusqlite::Result<Vec<Event>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, kind, detail, created_at FROM events
         WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT 100",
    )?;
    let rows = stmt
        .query_map(params![agent_id], |row| {
            Ok(Event {
                id: row.get("id")?,
                agent_id: row.get("agent_id")?,
                kind: row.get("kind")?,
                detail: row.get("detail")?,
                created_at: row.get("created_at")?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
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

    #[test]
    fn 프롬프트_저장_수정_삭제_라운드트립() {
        let conn = mem();
        let created = insert_prompt(&conn, "릴리스", "릴리스 준비를 해줘", 10).unwrap();
        assert_eq!(list_prompts(&conn).unwrap().len(), 1);

        update_prompt(&conn, &created.id, "릴리스 v2", "업데이트된 지시", 20).unwrap();
        let after = list_prompts(&conn).unwrap();
        assert_eq!(after[0].title, "릴리스 v2");
        assert_eq!(after[0].body, "업데이트된 지시");
        assert_eq!(after[0].updated_at, 20);

        delete_prompt(&conn, &created.id).unwrap();
        assert!(list_prompts(&conn).unwrap().is_empty());
    }

    #[test]
    fn 체크포인트_저장_조회_삭제_라운드트립() {
        let mut conn = mem();
        let project = insert_project_with_default_agent(
            &mut conn, "proj", "/tmp/proj", "codex", "codex", "main", 1,
        )
        .unwrap();
        let agent_id = &project.agents[0].id;

        let cp = insert_checkpoint(&conn, agent_id, "작업 전", "deadbeef", 10).unwrap();
        assert_eq!(list_checkpoints(&conn, agent_id).unwrap().len(), 1);
        assert_eq!(list_checkpoints(&conn, agent_id).unwrap()[0].sha, "deadbeef");
        assert_eq!(cp.label, "작업 전");

        delete_checkpoint(&conn, &cp.id).unwrap();
        assert!(list_checkpoints(&conn, agent_id).unwrap().is_empty());
    }

    #[test]
    fn 태스크_생성_상태변경_삭제_라운드트립() {
        let conn = mem();
        let task = insert_task(&conn, None, "로그인 개선", "메모", 10).unwrap();
        assert_eq!(task.status, "todo");
        assert_eq!(list_tasks(&conn).unwrap().len(), 1);

        set_task_status(&conn, &task.id, "doing", 20).unwrap();
        update_task(&conn, &task.id, "로그인 개선 v2", "수정된 메모", 30).unwrap();
        let after = list_tasks(&conn).unwrap();
        assert_eq!(after[0].status, "doing");
        assert_eq!(after[0].title, "로그인 개선 v2");

        delete_task(&conn, &task.id).unwrap();
        assert!(list_tasks(&conn).unwrap().is_empty());
    }

    #[test]
    fn 이벤트_기록과_최신순_조회() {
        let mut conn = mem();
        let project = insert_project_with_default_agent(
            &mut conn, "proj", "/tmp/proj", "codex", "codex", "main", 1,
        )
        .unwrap();
        let agent_id = &project.agents[0].id;

        insert_event(&conn, agent_id, "commit", "첫 커밋", 10).unwrap();
        insert_event(&conn, agent_id, "push", "feat/x", 20).unwrap();
        let events = list_events(&conn, agent_id).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].kind, "push");
        assert_eq!(events[1].detail, "첫 커밋");
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
            group_id: None,
            prompt: None,
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
    fn 프로젝트와_기본_작업환경을_함께_저장한다() {
        let mut conn = mem();
        let project = insert_project_with_default_agent(
            &mut conn,
            "proj",
            "/tmp/proj",
            "codex",
            "codex",
            "main",
            10,
        )
        .unwrap();

        assert_eq!(project.agents.len(), 1);
        let agent = &project.agents[0];
        assert_eq!(agent.title, "기본 작업환경");
        assert_eq!(agent.branch, "main");
        assert_eq!(agent.worktree_path, "/tmp/proj");
        assert!(!agent.worktree_managed);
    }

    #[test]
    fn 에이전트_저장_실패시_프로젝트도_롤백한다() {
        let mut conn = mem();
        conn.execute_batch(
            "CREATE TRIGGER reject_default_agent
             BEFORE INSERT ON agents BEGIN SELECT RAISE(ABORT, 'reject'); END;",
        )
        .unwrap();

        assert!(insert_project_with_default_agent(
            &mut conn,
            "proj",
            "/tmp/proj",
            "codex",
            "codex",
            "main",
            10,
        )
        .is_err());
        assert!(list_projects(&conn).unwrap().is_empty());
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

    #[test]
    fn 같은_worktree의_에이전트_참조를_센다() {
        let conn = mem();
        let project = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
        let mut first = sample_agent(&project.id);
        first.worktree_path = "/tmp/shared".into();
        let mut second = sample_agent(&project.id);
        second.worktree_path = "/tmp/shared".into();
        insert_agent(&conn, &first).unwrap();
        insert_agent(&conn, &second).unwrap();

        assert_eq!(count_agents_by_worktree(&conn, "/tmp/shared").unwrap(), 2);
        assert_eq!(count_agents_by_worktree(&conn, "/tmp/other").unwrap(), 0);
    }

    #[test]
    fn 공유_worktree의_관리_책임을_다음_에이전트로_이전한다() {
        let conn = mem();
        let project = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
        let mut owner = sample_agent(&project.id);
        owner.worktree_path = "/tmp/shared".into();
        owner.worktree_managed = true;
        let mut next = sample_agent(&project.id);
        next.worktree_path = "/tmp/shared".into();
        next.worktree_managed = false;
        insert_agent(&conn, &owner).unwrap();
        insert_agent(&conn, &next).unwrap();

        assert!(transfer_worktree_management(&conn, "/tmp/shared", &owner.id).unwrap());
        assert!(get_agent(&conn, &next.id).unwrap().unwrap().worktree_managed);
    }

    #[test]
    fn 관리_에이전트_삭제와_책임_이전을_한_트랜잭션으로_처리한다() {
        let mut conn = mem();
        let project = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
        let mut owner = sample_agent(&project.id);
        owner.worktree_path = "/tmp/shared".into();
        owner.worktree_managed = true;
        let mut next = sample_agent(&project.id);
        next.worktree_path = "/tmp/shared".into();
        next.worktree_managed = false;
        insert_agent(&conn, &owner).unwrap();
        insert_agent(&conn, &next).unwrap();

        delete_agent_with_worktree_transfer(&mut conn, &owner).unwrap();

        assert!(get_agent(&conn, &owner.id).unwrap().is_none());
        assert!(get_agent(&conn, &next.id).unwrap().unwrap().worktree_managed);
    }
    #[test]
    fn 기존_프로젝트에_기본_작업환경을_다시_추가한다() {
        let conn = mem();
        let project = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();

        assert!(!project_has_worktree_agent(&conn, &project.id, "/tmp/proj").unwrap());

        let agent =
            insert_default_agent(&conn, &project.id, "codex", "codex", "main", "/tmp/proj", 20)
                .unwrap();

        assert_eq!(agent.title, "기본 작업환경");
        assert_eq!(agent.branch, "main");
        assert_eq!(agent.worktree_path, "/tmp/proj");
        assert!(!agent.worktree_managed);
        assert!(project_has_worktree_agent(&conn, &project.id, "/tmp/proj").unwrap());
    }

    #[test]
    fn 다른_프로젝트의_같은_경로_에이전트는_중복으로_보지_않는다() {
        let conn = mem();
        let first = insert_project(&conn, "first", "/tmp/proj", 10).unwrap();
        let second = insert_project(&conn, "second", "/tmp/other", 10).unwrap();
        insert_default_agent(&conn, &first.id, "codex", "codex", "main", "/tmp/proj", 20).unwrap();

        assert!(project_has_worktree_agent(&conn, &first.id, "/tmp/proj").unwrap());
        assert!(!project_has_worktree_agent(&conn, &second.id, "/tmp/proj").unwrap());
    }

}
