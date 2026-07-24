import type { AgentStatus } from "$lib/types";

/** 특정 CLI 에이전트 없이 기본 셸만 여는 "빈 터미널" 워크스페이스 종류. */
export const BLANK_TERMINAL_KIND = "terminal";

export const statusLabels: Record<AgentStatus, string> = {
  running: "실행 중",
  idle: "대기",
  blocked: "입력 대기",
  done: "완료",
};