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
}
