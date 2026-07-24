export const DEFAULT_BUDGET_THRESHOLD = 80;
export const MIN_BUDGET_THRESHOLD = 1;
export const MAX_BUDGET_THRESHOLD = 100;

/** 임계값을 유효 범위(1~100 정수)로 clamp한다. */
export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BUDGET_THRESHOLD;
  return Math.min(MAX_BUDGET_THRESHOLD, Math.max(MIN_BUDGET_THRESHOLD, Math.round(value)));
}

/** 사용량 퍼센트가 예산 임계값을 넘었는지 판정한다. 미연동(null)은 false. */
export function overBudget(percent: number | null, threshold: number): boolean {
  return percent !== null && percent >= threshold;
}
