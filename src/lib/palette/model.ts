import type { AgentStatus, Project } from "$lib/types";
import { t } from "$lib/i18n";

export type PaletteItem =
  | { type: "action"; id: string; label: string; hint: string; shortcut?: string }
  | { type: "agent"; id: string; label: string; project: string; branch: string; status: AgentStatus };

/** 기본 액션 항목(에이전트 외 전역 명령). 현재 로케일로 라벨을 만든다. */
export function paletteActions(): PaletteItem[] {
  return [
    { type: "action", id: "overview", label: t("palette.action.overview.label"), hint: t("palette.action.overview.hint"), shortcut: "⌘0" },
    { type: "action", id: "newAgent", label: t("palette.action.newAgent.label"), hint: t("palette.action.newAgent.hint"), shortcut: "⌘N" },
    { type: "action", id: "newProject", label: t("palette.action.newProject.label"), hint: t("palette.action.newProject.hint") },
    { type: "action", id: "fanout", label: t("palette.action.fanout.label"), hint: t("palette.action.fanout.hint"), shortcut: "⌘⇧N" },
    { type: "action", id: "tasks", label: t("palette.action.tasks.label"), hint: t("palette.action.tasks.hint"), shortcut: "⌘⇧T" },
    { type: "action", id: "attention", label: t("palette.action.attention.label"), hint: t("palette.action.attention.hint"), shortcut: "⌘⇧A" },
    { type: "action", id: "shortcuts", label: t("palette.action.shortcuts.label"), hint: t("palette.action.shortcuts.hint"), shortcut: "⌘/" },
    { type: "action", id: "settings", label: t("palette.action.settings.label"), hint: t("palette.action.settings.hint"), shortcut: "⌘," },
  ];
}

/** 프로젝트의 에이전트를 팔레트 항목으로 변환한다. */
export function agentItems(projects: Project[]): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const project of projects) {
    for (const agent of project.agents) {
      items.push({
        type: "agent",
        id: agent.id,
        label: agent.title,
        project: project.name,
        branch: agent.branch,
        status: agent.status ?? "idle",
      });
    }
  }
  return items;
}

function haystack(item: PaletteItem): string {
  return item.type === "agent" ? `${item.label} ${item.project} ${item.branch}` : `${item.label} ${item.hint}`;
}

/**
 * 질의 적합도 점수. 매칭 실패는 null.
 * 접두 일치 > 단어 시작 일치 > 부분 문자열 > 순서만 맞는 부분열(퍼지) 순으로 높다.
 */
export function matchScore(text: string, query: string): number | null {
  const hay = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;

  const at = hay.indexOf(q);
  if (at === 0) return 1000;
  if (at > 0) return (hay[at - 1] === " " || hay[at - 1] === "/" || hay[at - 1] === "-" ? 800 : 600) - at;

  // 부분열(퍼지): 연속으로 이어질수록 높은 점수를 준다.
  let cursor = 0;
  let score = 200;
  let streak = 0;
  for (const char of q) {
    const found = hay.indexOf(char, cursor);
    if (found === -1) return null;
    streak = found === cursor ? streak + 1 : 0;
    score += streak * 4 - (found - cursor);
    cursor = found + 1;
  }
  return score;
}

/** 주의가 필요한 워크스페이스를 위로 올리는 가중치. */
const STATUS_BONUS: Record<AgentStatus, number> = { failed: 60, blocked: 50, running: 20, idle: 0, done: 10 };

/**
 * 질의로 항목을 걸러 점수순으로 정렬한다. 빈 질의면 최근 방문 항목만 앞으로 당기고
 * 나머지는 원래 순서를 유지한다(액션이 먼저 오도록 호출 측이 배열을 구성한다).
 */
export function filterPalette(items: PaletteItem[], query: string, recentIds: string[] = []): PaletteItem[] {
  const recentRank = new Map(recentIds.map((id, index) => [id, recentIds.length - index]));
  const q = query.trim();

  if (!q) {
    const recent = items.filter((item) => recentRank.has(item.id));
    if (recent.length === 0) return items;
    recent.sort((a, b) => (recentRank.get(b.id) ?? 0) - (recentRank.get(a.id) ?? 0));
    return [...recent, ...items.filter((item) => !recentRank.has(item.id))];
  }

  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const base = matchScore(haystack(item), q);
    if (base === null) return;
    const bonus =
      (item.type === "agent" ? STATUS_BONUS[item.status] : 30) + (recentRank.get(item.id) ?? 0) * 5;
    scored.push({ item, score: base + bonus, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((entry) => entry.item);
}
