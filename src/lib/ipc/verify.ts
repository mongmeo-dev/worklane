import { invoke } from "@tauri-apps/api/core";

export interface VerifyResult {
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  outputTail: string;
}

/** worktree에서 검증 명령(테스트/빌드 등)을 실행한다. */
export function runVerification(worktreePath: string, command: string): Promise<VerifyResult> {
  return invoke<VerifyResult>("run_verification", { worktreePath, command });
}
