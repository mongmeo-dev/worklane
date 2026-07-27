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
    /// 팬아웃 그룹 식별자. 같은 프롬프트로 병렬 생성된 에이전트끼리 공유한다.
    #[serde(default)]
    pub group_id: Option<String>,
    /// 팬아웃 시 공유한 작업 프롬프트(비교/복사용).
    #[serde(default)]
    pub prompt: Option<String>,
    /// 이 워크스페이스(=worktree)에서 여는 터미널 탭 목록. 주 터미널 개념은 없고
    /// 모든 터미널이 동등하다. list_projects에서 채워진다.
    #[serde(default)]
    pub terminals: Vec<AgentTerminal>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 에이전트 제목 변경의 좁은 응답 DTO. 워크스페이스/터미널 상태는 포함하지 않는다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTitlePatch {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
}
/// 워크스페이스(=worktree) 안에서 크롬 탭처럼 여는 터미널 세션 한 건.
/// 각 탭은 독립 PTY 세션이며, 주입한 커맨드로 어떤 에이전트가 도는지 추적한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTerminal {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub kind: String,
    pub command: String,
    pub position: i64,
    pub created_at: i64,
}

/// 프로젝트와 소속 에이전트 목록.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_branch: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub agents: Vec<Agent>,
}

/// 재사용 프롬프트/플레이북 라이브러리 항목.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// worktree 체크포인트(스냅샷) 한 건.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub agent_id: String,
    pub label: String,
    pub sha: String,
    pub created_at: i64,
}

/// 크로스 프로젝트 태스크 한 건. status는 "todo" | "doing" | "done".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub notes: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 세션 감사 타임라인 이벤트 한 건.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub agent_id: String,
    /// commit/push/pr/verify/checkpoint/rollback/status/adopt/fanout 등
    pub kind: String,
    pub detail: String,
    pub created_at: i64,
}

/// 팬아웃 플레이북(재사용 레시피). members는 [{"kind","command"}] JSON 문자열.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playbook {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub base: String,
    pub members: String,
    pub created_at: i64,
    pub updated_at: i64,
}
