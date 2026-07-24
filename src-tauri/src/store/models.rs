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
