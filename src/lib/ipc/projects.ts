import { invoke } from "@tauri-apps/api/core";
import type { AgentKind, Agent, AgentTerminal, Project } from "$lib/types";
export interface AgentTitlePatch {
  id: string;
  title: string;
  updatedAt: number;
}

export function listProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

export function createProject(
  name: string,
  path: string,
  kind: AgentKind,
  command: string,
): Promise<Project> {
  return invoke<Project>("create_project_with_default_agent", { name, path, kind, command });
}

export function deleteProject(id: string): Promise<string[]> {
  return invoke<string[]>("delete_project", { id });
}

export function createDefaultAgent(
  projectId: string,
  kind: AgentKind,
  command: string,
): Promise<Agent> {
  return invoke<Agent>("create_default_agent", { projectId, kind, command });
}

export interface CreateAgentOptions {
  projectId: string;
  projectPath: string;
  title: string;
  kind: AgentKind;
  command: string;
  branch: string;
  startPoint: string;
  /** true이면 다른 에이전트의 worktreePath를 그대로 재사용한다. */
  shareWorktree?: boolean;
  worktreePath?: string;
  /** 팬아웃 그룹 식별자(멀티 에이전트 병렬 생성 시 공유). */
  groupId?: string;
  /** 팬아웃 시 공유한 작업 프롬프트. */
  prompt?: string;
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
    groupId: opts.groupId ?? null,
    prompt: opts.prompt ?? null,
  });
}

export function deleteAgent(id: string, removeWorktree: boolean, force: boolean): Promise<string[]> {
  return invoke<string[]>("delete_agent", { id, removeWorktree, force });
}
export function patchAgentTitle(id: string, title: string): Promise<AgentTitlePatch> {
  return invoke<AgentTitlePatch>("update_agent_title", { id, title });
}

export function agentWorktreeHasChanges(id: string): Promise<boolean> {
  return invoke<boolean>("agent_worktree_has_changes", { id });
}

/** 워크스페이스에 새 터미널 탭을 추가한다. */
export function createAgentTerminal(
  agentId: string,
  kind: AgentKind,
  command: string,
  title: string,
): Promise<AgentTerminal> {
  return invoke<AgentTerminal>("create_agent_terminal", { agentId, kind, command, title });
}

/** 워크스페이스의 터미널 탭을 삭제한다. */
export function deleteAgentTerminal(id: string): Promise<void> {
  return invoke("delete_agent_terminal", { id });
}
