import type { AgentStatus } from "$lib/types";
import { t } from "$lib/i18n";

/** 특정 CLI 에이전트 없이 기본 셸만 여는 "빈 터미널" 워크스페이스 종류. */
export const BLANK_TERMINAL_KIND = "terminal";

/** 현재 로케일의 상태 표시 라벨. */
export function statusLabel(status: AgentStatus): string {
  return t(`status.${status}`);
}
