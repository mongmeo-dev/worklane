import type { ReviewStatus } from "$lib/ipc/review";
import { t } from "$lib/i18n";

/** 푸시 버튼 라벨. upstream 미설정이면 게시, 앞선 커밋 수가 있으면 개수 표기. */
export function pushLabel(status: ReviewStatus): string {
  if (!status.hasUpstream) return t("review.publishBranch");
  if (status.ahead > 0) return t("review.pushAhead", { count: status.ahead });
  return t("review.pushed");
}

/** 푸시 가능 여부. 원격이 있어야 하고, 게시 전이거나 앞선 커밋이 있어야 한다. */
export function canPush(status: ReviewStatus): boolean {
  return status.hasRemote && (!status.hasUpstream || status.ahead > 0);
}

/** 커밋 가능 여부. 변경이 있고 메시지가 비어있지 않아야 한다. */
export function canCommit(changedCount: number, message: string): boolean {
  return changedCount > 0 && message.trim().length > 0;
}
