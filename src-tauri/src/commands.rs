use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::Manager;

use crate::pty::{self, PtyOutput, PtyState};
use crate::store::{self, models::{Agent, Project}, StoreState};
use crate::git;
use crate::pty::now_ms;

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

/// 지정한 worktree 경로의 uncommitted 변경(working tree diff)을 unified diff 문자열로 반환한다.
#[tauri::command]
pub async fn git_diff(cwd: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::diff_working_tree(&cwd))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_system_resources() -> Result<crate::system::SystemResources, String> {
    tauri::async_runtime::spawn_blocking(crate::system::read_resources)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_codex_usage() -> Result<crate::usage::UsageInfo, String> {
    tauri::async_runtime::spawn_blocking(crate::usage::codex::read_usage)
        .await
        .map_err(|e| e.to_string())
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
    store::repo::insert_project(&conn, &name, &path, now_ms() as i64).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(
    store: tauri::State<'_, StoreState>,
    id: String,
) -> Result<(), String> {
    // 1) 짧게 락을 잡고 대상 프로젝트+에이전트 조회 후 즉시 락 해제.
    let target = {
        let conn = store.0.lock().map_err(|e| e.to_string())?;
        let projects = store::repo::list_projects(&conn).map_err(|e| e.to_string())?;
        projects.into_iter().find(|p| p.id == id)
    };

    // 2) 락 밖에서 managed worktree들을 순회하며 blocking git 호출 수행.
    //    개별 worktree 정리 실패는 로그로만 남기고(고아 worktree 발생 가능) 계속 진행한다.
    //    - delete_project는 일괄 삭제이므로 사용자가 명시적으로 의도한 프로젝트 삭제 자체를
    //      worktree 정리 실패(dirty 등) 때문에 전부 막는 것은 트레이드오프상 바람직하지 않다고 판단.
    //      (단일 에이전트 삭제인 delete_agent는 반대로 실패를 `?`로 전파해 사용자가 강제삭제를
    //      재선택하도록 한다 — 여기서는 그 판단을 사용자에게 되돌릴 수 없으므로 로그로 남긴다.)
    if let Some(p) = &target {
        let mut failed_worktrees = Vec::new();
        for a in &p.agents {
            if a.worktree_managed {
                if let Err(e) = git::remove_worktree(&p.path, &a.worktree_path, true) {
                    failed_worktrees.push((a.worktree_path.clone(), e));
                }
            }
        }
        if !failed_worktrees.is_empty() {
            for (path, err) in &failed_worktrees {
                eprintln!(
                    "[delete_project] worktree 정리 실패, 고아로 남을 수 있음: {path} ({err})"
                );
            }
        }
    }

    // 3) 다시 짧게 락을 잡고 프로젝트 삭제(DB).
    let conn = store.0.lock().map_err(|e| e.to_string())?;
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
    let now = now_ms() as i64;
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
    // 1) 짧게 락을 잡고 조회 후 즉시 락 해제.
    let agent = {
        let conn = store.0.lock().map_err(|e| e.to_string())?;
        store::repo::get_agent(&conn, &id).map_err(|e| e.to_string())?
    };

    // 2) 락 밖에서 blocking git 호출 수행. 단일 에이전트 삭제이므로 실패(dirty 등)는
    //    `?`로 전파해 사용자가 강제삭제를 재선택하도록 한다(기존 동작 유지).
    if let Some(a) = &agent {
        if remove_worktree && a.worktree_managed {
            // repo_path는 worktree 자체 경로로도 git worktree remove가 동작(공통 .git 참조).
            git::remove_worktree(&a.worktree_path, &a.worktree_path, force)?;
        }
    }

    // 3) 다시 짧게 락을 잡고 삭제(DB).
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::delete_agent(&conn, &id).map_err(|e| e.to_string())
}
