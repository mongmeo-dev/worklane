import { invoke } from "@tauri-apps/api/core";

/** 에이전트 세션 프로세스 트리가 여는 LISTEN 포트를 감지한다(macOS lsof 기반). */
export function detectPreviewPorts(sessionId: string): Promise<number[]> {
  return invoke<number[]>("detect_preview_ports", { sessionId });
}
