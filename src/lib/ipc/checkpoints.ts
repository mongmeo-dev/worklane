import { invoke } from "@tauri-apps/api/core";

export interface Checkpoint {
  id: string;
  agentId: string;
  label: string;
  sha: string;
  createdAt: number;
}

/** 현재 worktree 상태를 체크포인트로 저장한다. */
export function createCheckpoint(
  agentId: string,
  worktreePath: string,
  label: string,
): Promise<Checkpoint> {
  return invoke<Checkpoint>("create_checkpoint", { agentId, worktreePath, label });
}

export function listCheckpoints(agentId: string): Promise<Checkpoint[]> {
  return invoke<Checkpoint[]>("list_checkpoints", { agentId });
}

/** worktree를 체크포인트 스냅샷으로 되돌린다. 되돌리기 전 상태는 자동 체크포인트로 저장된다. */
export function rollbackCheckpoint(agentId: string, worktreePath: string, sha: string): Promise<void> {
  return invoke("rollback_checkpoint", { agentId, worktreePath, sha });
}

export function deleteCheckpoint(worktreePath: string, id: string): Promise<void> {
  return invoke("delete_checkpoint", { worktreePath, id });
}
