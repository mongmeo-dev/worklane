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
