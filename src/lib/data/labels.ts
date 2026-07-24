import type { AgentKind, AgentStatus } from "$lib/types";

export const agentKindLabels: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
  terminal: "빈 터미널",
};

/** 특정 CLI 에이전트 없이 기본 셸만 여는 "빈 터미널" 워크스페이스 종류. */
export const BLANK_TERMINAL_KIND = "terminal" satisfies AgentKind;

/** 실제 CLI 코딩 에이전트 종류(빈 터미널 제외). 팬아웃·기본 커맨드 등 에이전트 전용 화면에서 사용. */
export const cliAgentKinds: AgentKind[] = ["claude-code", "codex", "cursor", "gemini"];

/** 워크스페이스 생성 시 고를 수 있는 전체 종류(빈 터미널 포함, 목록 맨 뒤에 배치). */
export const agentKinds: AgentKind[] = [...cliAgentKinds, BLANK_TERMINAL_KIND];

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
  cursor: "cursor-agent",
  gemini: "gemini",
  terminal: "",
};
