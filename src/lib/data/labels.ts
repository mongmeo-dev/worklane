import type { AgentKind, AgentStatus } from "$lib/types";

export const agentKindLabels: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
};

export const statusLabels: Record<AgentStatus, string> = {
  running: "실행 중",
  idle: "대기",
  blocked: "입력 대기",
  done: "완료",
};

/** kind 선택 시 실행 커맨드 입력란에 자동으로 채워지는 기본값. */
export const agentKindDefaults: Record<AgentKind, string> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini",
};
