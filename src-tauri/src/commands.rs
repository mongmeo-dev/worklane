use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::Manager;

use crate::pty::{self, PtyOutput, PtyState};
use crate::store::{self, models::{Agent, Checkpoint, Event, Playbook, Project, Prompt, Task}, StoreState};
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
#[allow(clippy::too_many_arguments)]
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

/// 검토 대상 worktree의 커밋/푸시 상태 요약을 반환한다.
#[tauri::command]
pub async fn git_review_status(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<crate::git::ReviewStatus, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::review_status(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// worktree의 모든 변경을 스테이징 후 커밋한다.
#[tauri::command]
pub async fn git_commit_all(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    message: String,
) -> Result<(), String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::commit_all(&worktree_path, &message))
        .await
        .map_err(|e| e.to_string())?
}

/// 현재 브랜치를 origin에 푸시한다. 푸시한 브랜치명을 반환한다.
#[tauri::command]
pub async fn git_push(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<String, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::push_current_branch(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// PR을 생성하거나 GitHub compare 페이지 URL을 반환한다.
#[tauri::command]
pub async fn git_open_pull_request(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<crate::git::PullRequest, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::open_pull_request(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// worktree 경로를 외부 에디터 또는 파일 매니저로 연다.
#[tauri::command]
pub async fn open_in_app(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    app: String,
) -> Result<(), String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::external::open_in_app(&worktree_path, &app))
        .await
        .map_err(|e| e.to_string())?
}

/// 저장소의 열린 GitHub 이슈를 조회한다.
#[tauri::command]
pub async fn github_issues(repo_path: String) -> Result<Vec<crate::git::GithubIssue>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::list_github_issues(&repo_path))
        .await
        .map_err(|e| e.to_string())?
}

/// Slack/Discord 웹훅으로 알림 메시지를 보낸다.
#[tauri::command]
pub async fn send_webhook(url: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::webhook::send_webhook(&url, &text))
        .await
        .map_err(|e| e.to_string())?
}

/// Linear에서 내게 할당된 미완료 이슈를 조회한다.
#[tauri::command]
pub async fn linear_issues(api_key: String) -> Result<Vec<crate::linear::LinearIssue>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::linear::list_linear_issues(&api_key))
        .await
        .map_err(|e| e.to_string())?
}

/// 현재 브랜치 PR의 상태(CI 체크 포함)를 조회한다. PR이 없으면 null.
#[tauri::command]
pub async fn git_pr_status(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<Option<crate::git::PrStatus>, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::pr_status(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// 현재 브랜치의 PR을 병합한다(method: squash/rebase/merge).
#[tauri::command]
pub async fn git_pr_merge(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    method: String,
) -> Result<String, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::pr_merge(&worktree_path, &method))
        .await
        .map_err(|e| e.to_string())?
}

/// 현재 브랜치를 기준 브랜치에 병합했을 때의 충돌/상태를 미리 계산한다.
#[tauri::command]
pub async fn git_merge_preview(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<crate::git::MergePreview, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::merge_preview(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// 현재 브랜치를 기준 브랜치에 로컬 병합한다.
#[tauri::command]
pub async fn git_merge_into_base(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<String, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::merge_into_base(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

/// worktree에서 검증 명령을 실행한다(팬아웃 결과 자동 검증용).
#[tauri::command]
pub async fn run_verification(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    command: String,
) -> Result<crate::verify::VerifyResult, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::verify::run_verification(&worktree_path, &command))
        .await
        .map_err(|e| e.to_string())?
}

/// 에이전트 세션 프로세스 트리가 여는 LISTEN 포트를 감지한다(프리뷰 자동 연결용).
#[tauri::command]
pub async fn detect_preview_ports(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<Vec<u16>, String> {
    let session = state.0.get(&session_id).map(|r| r.value().clone());
    let Some(session) = session else {
        return Ok(Vec::new());
    };
    let pid = session.child.lock().map_err(|e| e.to_string())?.process_id();
    let Some(pid) = pid else {
        return Ok(Vec::new());
    };
    tauri::async_runtime::spawn_blocking(move || crate::ports::detect_ports(pid))
        .await
        .map_err(|e| e.to_string())
}

/// 프롬프트 라이브러리를 나열한다.
#[tauri::command]
pub fn list_prompts(store: tauri::State<'_, StoreState>) -> Result<Vec<Prompt>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_prompts(&conn).map_err(|e| e.to_string())
}

/// 프롬프트를 새로 저장한다.
#[tauri::command]
pub fn create_prompt(
    store: tauri::State<'_, StoreState>,
    title: String,
    body: String,
) -> Result<Prompt, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("프롬프트 제목을 입력하세요.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::insert_prompt(&conn, title, body.trim(), now_ms() as i64).map_err(|e| e.to_string())
}

/// 프롬프트를 수정한다.
#[tauri::command]
pub fn update_prompt(
    store: tauri::State<'_, StoreState>,
    id: String,
    title: String,
    body: String,
) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("프롬프트 제목을 입력하세요.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::update_prompt(&conn, &id, title, body.trim(), now_ms() as i64)
        .map_err(|e| e.to_string())
}

/// 프롬프트를 삭제한다.
#[tauri::command]
pub fn delete_prompt(store: tauri::State<'_, StoreState>, id: String) -> Result<(), String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::delete_prompt(&conn, &id).map_err(|e| e.to_string())
}

/// 에이전트 worktree의 현재 상태를 체크포인트(스냅샷)로 저장한다.
#[tauri::command]
pub async fn create_checkpoint(
    store: tauri::State<'_, StoreState>,
    agent_id: String,
    worktree_path: String,
    label: String,
) -> Result<Checkpoint, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    let sha = tauri::async_runtime::spawn_blocking({
        let worktree_path = worktree_path.clone();
        move || crate::git::snapshot_worktree(&worktree_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    let sha = sha.ok_or_else(|| "저장할 변경이 없습니다.".to_string())?;

    let label = if label.trim().is_empty() { "체크포인트".to_string() } else { label.trim().to_string() };
    let checkpoint = {
        let conn = store.0.lock().map_err(|e| e.to_string())?;
        store::repo::insert_checkpoint(&conn, &agent_id, &label, &sha, now_ms() as i64)
            .map_err(|e| e.to_string())?
    };
    crate::git::anchor_checkpoint(&worktree_path, &checkpoint.id, &sha)?;
    Ok(checkpoint)
}

/// 에이전트의 체크포인트 목록을 반환한다.
#[tauri::command]
pub fn list_checkpoints(
    store: tauri::State<'_, StoreState>,
    agent_id: String,
) -> Result<Vec<Checkpoint>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_checkpoints(&conn, &agent_id).map_err(|e| e.to_string())
}

/// worktree를 지정한 체크포인트 스냅샷으로 되돌린다(추적 변경 기준).
/// 되돌리기 전에 현재 상태를 "롤백 전 자동" 체크포인트로 저장해 취소 가능하게 한다.
#[tauri::command]
pub async fn rollback_checkpoint(
    store: tauri::State<'_, StoreState>,
    agent_id: String,
    worktree_path: String,
    sha: String,
) -> Result<(), String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;

    // 되돌리기 전 현재 상태 자동 스냅샷(변경이 있을 때만).
    let before = tauri::async_runtime::spawn_blocking({
        let worktree_path = worktree_path.clone();
        move || crate::git::snapshot_worktree(&worktree_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if let Some(before_sha) = before {
        let checkpoint = {
            let conn = store.0.lock().map_err(|e| e.to_string())?;
            store::repo::insert_checkpoint(&conn, &agent_id, "롤백 전 자동", &before_sha, now_ms() as i64)
                .map_err(|e| e.to_string())?
        };
        crate::git::anchor_checkpoint(&worktree_path, &checkpoint.id, &before_sha)?;
    }

    tauri::async_runtime::spawn_blocking(move || crate::git::restore_snapshot(&worktree_path, &sha))
        .await
        .map_err(|e| e.to_string())?
}

/// 체크포인트를 삭제한다(고정 ref와 DB 항목 모두 제거).
#[tauri::command]
pub fn delete_checkpoint(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    id: String,
) -> Result<(), String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    crate::git::drop_checkpoint_ref(&worktree_path, &id);
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::delete_checkpoint(&conn, &id).map_err(|e| e.to_string())
}

/// 태스크 보드의 모든 태스크를 반환한다.
#[tauri::command]
pub fn list_tasks(store: tauri::State<'_, StoreState>) -> Result<Vec<Task>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_tasks(&conn).map_err(|e| e.to_string())
}

/// 태스크를 새로 만든다.
#[tauri::command]
pub fn create_task(
    store: tauri::State<'_, StoreState>,
    project_id: Option<String>,
    title: String,
    notes: String,
) -> Result<Task, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("태스크 제목을 입력하세요.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::insert_task(&conn, project_id.as_deref(), title, notes.trim(), now_ms() as i64)
        .map_err(|e| e.to_string())
}

/// 태스크의 제목/메모를 수정한다.
#[tauri::command]
pub fn update_task(
    store: tauri::State<'_, StoreState>,
    id: String,
    title: String,
    notes: String,
) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("태스크 제목을 입력하세요.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::update_task(&conn, &id, title, notes.trim(), now_ms() as i64)
        .map_err(|e| e.to_string())
}

/// 태스크 상태를 변경한다(todo/doing/done).
#[tauri::command]
pub fn set_task_status(
    store: tauri::State<'_, StoreState>,
    id: String,
    status: String,
) -> Result<(), String> {
    if !matches!(status.as_str(), "todo" | "doing" | "done") {
        return Err("알 수 없는 태스크 상태입니다.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::set_task_status(&conn, &id, &status, now_ms() as i64).map_err(|e| e.to_string())
}

/// 태스크를 삭제한다.
#[tauri::command]
pub fn delete_task(store: tauri::State<'_, StoreState>, id: String) -> Result<(), String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::delete_task(&conn, &id).map_err(|e| e.to_string())
}

/// 감사 타임라인 이벤트를 기록한다.
#[tauri::command]
pub fn record_event(
    store: tauri::State<'_, StoreState>,
    agent_id: String,
    kind: String,
    detail: String,
) -> Result<Event, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::insert_event(&conn, &agent_id, &kind, &detail, now_ms() as i64)
        .map_err(|e| e.to_string())
}

/// 에이전트의 감사 타임라인을 반환한다.
#[tauri::command]
pub fn list_events(
    store: tauri::State<'_, StoreState>,
    agent_id: String,
) -> Result<Vec<Event>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_events(&conn, &agent_id).map_err(|e| e.to_string())
}

/// 팬아웃 플레이북을 나열한다.
#[tauri::command]
pub fn list_playbooks(store: tauri::State<'_, StoreState>) -> Result<Vec<Playbook>, String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::list_playbooks(&conn).map_err(|e| e.to_string())
}

/// 팬아웃 플레이북을 저장한다.
#[tauri::command]
pub fn create_playbook(
    store: tauri::State<'_, StoreState>,
    name: String,
    prompt: String,
    base: String,
    members: String,
) -> Result<Playbook, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("플레이북 이름을 입력하세요.".into());
    }
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::insert_playbook(&conn, name, prompt.trim(), base.trim(), &members, now_ms() as i64)
        .map_err(|e| e.to_string())
}

/// 팬아웃 플레이북을 삭제한다.
#[tauri::command]
pub fn delete_playbook(store: tauri::State<'_, StoreState>, id: String) -> Result<(), String> {
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    store::repo::delete_playbook(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_worktree_files(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
) -> Result<Vec<crate::git::FileEntry>, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || crate::git::list_files(&worktree_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_worktree_file(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    rel_path: String,
) -> Result<crate::files::FileContent, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::files::read_file(&worktree_path, &rel_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_file_diff(
    store: tauri::State<'_, StoreState>,
    worktree_path: String,
    rel_path: String,
) -> Result<Vec<crate::git::DiffLine>, String> {
    let worktree_path = registered_worktree_path(&store, &worktree_path)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::file_diff_lines(&worktree_path, &rel_path)
    })
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

#[tauri::command]
pub async fn read_claude_usage() -> Result<crate::usage::UsageInfo, String> {
    tauri::async_runtime::spawn_blocking(crate::usage::claude::read_usage)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_claude_statusline() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::usage::claude::install_statusline)
        .await
        .map_err(|e| e.to_string())?
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

/// 특정 CLI 없이 기본 셸만 여는 빈 터미널 워크스페이스 종류.
const BLANK_TERMINAL_KIND: &str = "terminal";

/// 빈 터미널을 제외한 종류는 실행 커맨드가 필요하다.
fn command_required(kind: &str) -> bool {
    kind.trim() != BLANK_TERMINAL_KIND
}

fn validate_default_workspace_input(name: &str, kind: &str, command: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("프로젝트 이름을 입력해 주세요.".into());
    }
    if kind.trim().is_empty() {
        return Err("에이전트 종류를 선택해 주세요.".into());
    }
    if command_required(kind) && command.trim().is_empty() {
        return Err("에이전트 종류와 실행 명령을 확인해 주세요.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn create_project_with_default_agent(
    store: tauri::State<'_, StoreState>,
    name: String,
    path: String,
    kind: String,
    command: String,
) -> Result<Project, String> {
    validate_default_workspace_input(&name, &kind, &command)?;
    let workspace = git::inspect_existing_workspace(&path)?;
    let mut conn = store.0.lock().map_err(|error| error.to_string())?;
    store::repo::insert_project_with_default_agent(
        &mut conn,
        name.trim(),
        &workspace.path,
        kind.trim(),
        command.trim(),
        &workspace.branch,
        now_ms() as i64,
    )
    .map_err(|error| error.to_string())
}

/// 기존 프로젝트에 기본 작업환경(저장소 본체에서 동작하는 에이전트)을 다시 만든다.
/// 기본 작업환경을 삭제한 뒤 복구할 때 사용하며, 현재 checkout된 브랜치를 기준으로 만든다.
#[tauri::command]
pub fn create_default_agent(
    store: tauri::State<'_, StoreState>,
    project_id: String,
    kind: String,
    command: String,
) -> Result<Agent, String> {
    if kind.trim().is_empty() {
        return Err("에이전트 종류를 선택해 주세요.".into());
    }
    if command_required(&kind) && command.trim().is_empty() {
        return Err("에이전트 종류와 실행 명령을 확인해 주세요.".into());
    }

    // 1) 짧게 락을 잡고 프로젝트 경로만 조회한 뒤 즉시 해제한다.
    let project_path = {
        let conn = store.0.lock().map_err(|e| e.to_string())?;
        store::repo::list_projects(&conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|p| p.id == project_id)
            .map(|p| p.path)
            .ok_or_else(|| "프로젝트를 찾을 수 없습니다.".to_string())?
    };

    // 2) 락 밖에서 현재 checkout 브랜치와 정규화 경로를 확인한다(blocking git).
    let workspace = git::inspect_existing_workspace(&project_path)?;

    // 3) 다시 락을 잡고 중복 여부 확인 후 삽입한다.
    let conn = store.0.lock().map_err(|e| e.to_string())?;
    if store::repo::project_has_worktree_agent(&conn, &project_id, &workspace.path)
        .map_err(|e| e.to_string())?
    {
        return Err("이미 기본 작업환경이 있습니다.".into());
    }
    store::repo::insert_default_agent(
        &conn,
        &project_id,
        kind.trim(),
        command.trim(),
        &workspace.branch,
        &workspace.path,
        now_ms() as i64,
    )
    .map_err(|e| e.to_string())
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
        let mut removed = std::collections::HashSet::new();
        for a in &p.agents {
            if a.worktree_managed && removed.insert(a.worktree_path.clone()) {
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
    group_id: Option<String>,
    prompt: Option<String>,
) -> Result<Agent, String> {
    use tauri::Manager;
    let explicit_path = worktree_path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty());
    // worktree 경로 결정: 미지정 시 app_data_dir/worktrees/<project_id>/<branch>
    let wt_path = match worktree_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => {
            let base = app.path().app_data_dir().map_err(|e| e.to_string())?
                .join("worktrees").join(&project_id).join(&branch);
            base.to_string_lossy().into_owned()
        }
    };

    // 1) 이미 존재하는 worktree는 재사용하고, 새 경로만 앱 관리 대상으로 생성한다.
    let reused = git::is_existing_worktree(&wt_path);
    let created = if reused {
        let canonical = std::fs::canonicalize(&wt_path).map_err(|e| e.to_string())?;
        canonical.to_string_lossy().into_owned()
    } else {
        git::create_worktree(&project_path, &branch, &start_point, &wt_path)?
    };
    let created_new = !reused;
    let managed = should_manage_worktree(explicit_path, reused);

    // 2) DB insert. 새로 만든 worktree만 실패 시 롤백하며, 재사용 경로는 건드리지 않는다.
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
        group_id,
        prompt,
        created_at: now,
        updated_at: now,
    };
    let inserted = match store.0.lock() {
        Ok(conn) => store::repo::insert_agent(&conn, &agent),
        Err(error) => {
            if created_new {
                let _ = git::remove_worktree(&project_path, &created, true);
            }
            return Err(error.to_string());
        }
    };
    if let Err(e) = inserted {
        if created_new {
            let _ = git::remove_worktree(&project_path, &created, true);
        }
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
    // 1) 짧게 락을 잡고 대상과 현재 참조 수를 함께 조회한 뒤 즉시 락 해제.
    let target = {
        let conn = store.0.lock().map_err(|e| e.to_string())?;
        let agent = store::repo::get_agent(&conn, &id).map_err(|e| e.to_string())?;
        match agent {
            Some(agent) => {
                let references = store::repo::count_agents_by_worktree(
                    &conn,
                    &agent.worktree_path,
                )
                .map_err(|e| e.to_string())?;
                Some((agent, references))
            }
            None => None,
        }
    };

    // 2) 마지막 관리 참조만 락 밖에서 실제 worktree를 제거한다.
    if let Some((agent, references)) = &target {
        if should_remove_worktree(remove_worktree, agent.worktree_managed, *references) {
            // repo_path는 worktree 자체 경로로도 git worktree remove가 동작(공통 .git 참조).
            git::remove_worktree(&agent.worktree_path, &agent.worktree_path, force)?;
        }
    }

    // 3) 공유 관리 책임 이전과 DB 삭제를 한 트랜잭션으로 처리한다.
    let mut conn = store.0.lock().map_err(|e| e.to_string())?;
    match &target {
        Some((agent, _)) => store::repo::delete_agent_with_worktree_transfer(&mut conn, agent)
            .map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

fn should_remove_worktree(remove_requested: bool, managed: bool, references: i64) -> bool {
    remove_requested && managed && references <= 1
}

fn should_manage_worktree(explicit_path: bool, reused: bool) -> bool {
    !explicit_path && !reused
}

fn registered_worktree_path(store: &StoreState, worktree_path: &str) -> Result<String, String> {
    let canonical = std::fs::canonicalize(worktree_path).map_err(|error| error.to_string())?;
    let canonical = canonical.to_string_lossy().into_owned();
    let conn = store.0.lock().map_err(|error| error.to_string())?;
    let references = store::repo::count_agents_by_worktree(&conn, &canonical)
        .map_err(|error| error.to_string())?;
    if references == 0 {
        return Err("등록되지 않은 worktree 경로 접근 거부".into());
    }
    Ok(canonical)
}

#[cfg(test)]
mod shared_worktree_tests {
    use super::*;

    fn store_with_agent(worktree_path: &str) -> StoreState {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        store::repo::migrate(&conn).unwrap();
        let project = store::repo::insert_project(&conn, "테스트", "/tmp/project", 1).unwrap();
        store::repo::insert_agent(
            &conn,
            &Agent {
                id: uuid::Uuid::new_v4().to_string(),
                project_id: project.id,
                title: "테스트".into(),
                kind: "codex".into(),
                command: "codex".into(),
                branch: "main".into(),
                worktree_path: worktree_path.into(),
                worktree_managed: false,
                group_id: None,
                prompt: None,
                created_at: 1,
                updated_at: 1,
            },
        )
        .unwrap();
        StoreState(std::sync::Mutex::new(conn))
    }

    #[test]
    fn 마지막_관리_참조만_worktree를_제거한다() {
        assert!(should_remove_worktree(true, true, 1));
        assert!(!should_remove_worktree(true, true, 2));
        assert!(!should_remove_worktree(true, false, 1));
        assert!(!should_remove_worktree(false, true, 1));
    }

    #[test]
    fn 기본_작업환경_입력은_빈_값을_거부한다() {
        assert!(validate_default_workspace_input("", "codex", "codex").is_err());
        assert!(validate_default_workspace_input("프로젝트", "", "codex").is_err());
        assert!(validate_default_workspace_input("프로젝트", "codex", "").is_err());
        assert!(validate_default_workspace_input("프로젝트", "codex", "codex").is_ok());
        // 빈 터미널은 실행 명령이 없어도 허용한다.
        assert!(validate_default_workspace_input("프로젝트", "terminal", "").is_ok());
        assert!(command_required("codex"));
        assert!(!command_required("terminal"));
    }

    #[test]
    fn 명시한_worktree_경로는_앱_관리_대상으로_표시하지_않는다() {
        assert!(!should_manage_worktree(true, false));
        assert!(!should_manage_worktree(true, true));
        assert!(should_manage_worktree(false, false));
        assert!(!should_manage_worktree(false, true));
    }

    #[test]
    fn 등록한_worktree만_파일_명령에_허용한다() {
        let directory = std::env::temp_dir().join(format!("등록경로-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let canonical = std::fs::canonicalize(&directory).unwrap();
        let canonical_text = canonical.to_string_lossy().into_owned();
        let store = store_with_agent(&canonical_text);

        assert_eq!(
            registered_worktree_path(&store, &canonical_text).unwrap(),
            canonical_text
        );
        assert!(registered_worktree_path(&store, "/").is_err());

        std::fs::remove_dir_all(directory).unwrap();
    }
}
