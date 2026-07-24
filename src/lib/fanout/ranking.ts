/** 팬아웃 멤버 랭킹 입력. */
export interface RankInput {
  agentId: string;
  /** 변경 파일 수(적을수록 우선) */
  changed: number;
  /** 검증 통과 여부 */
  success: boolean;
  /** 검증 소요(ms, 빠를수록 우선) */
  durationMs: number;
}

/**
 * 검증 결과로 채택 추천 멤버를 고른다.
 * 통과한 멤버 중 변경이 가장 적고(동률이면 더 빠른) 것을 추천한다.
 * 통과한 멤버가 없으면 null.
 */
export function recommendWinner(items: RankInput[]): string | null {
  const passing = items.filter((i) => i.success);
  if (passing.length === 0) return null;
  const sorted = [...passing].sort(
    (a, b) => a.changed - b.changed || a.durationMs - b.durationMs,
  );
  return sorted[0].agentId;
}
