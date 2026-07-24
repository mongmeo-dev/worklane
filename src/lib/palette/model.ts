import type { AgentStatus, Project } from "$lib/types";
import { t } from "$lib/i18n";

export type PaletteItem =
  | { type: "action"; id: string; label: string; hint: string }
  | { type: "agent"; id: string; label: string; project: string; status: AgentStatus };

/** 기본 액션 항목(에이전트 외 전역 명령). 현재 로케일로 라벨을 만든다. */
export function paletteActions(): PaletteItem[] {
  return [
    { type: "action", id: "overview", label: t("palette.action.overview.label"), hint: t("palette.action.overview.hint") },
    { type: "action", id: "newAgent", label: t("palette.action.newAgent.label"), hint: t("palette.action.newAgent.hint") },
    { type: "action", id: "fanout", label: t("palette.action.fanout.label"), hint: t("palette.action.fanout.hint") },
    { type: "action", id: "tasks", label: t("palette.action.tasks.label"), hint: t("palette.action.tasks.hint") },
    { type: "action", id: "settings", label: t("palette.action.settings.label"), hint: t("palette.action.settings.hint") },
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
        status: agent.status ?? "idle",
      });
    }
  }
  return items;
}

/** 질의로 항목을 필터링한다. 빈 질의면 전체를 그대로 반환한다. */
export function filterPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = item.type === "agent" ? `${item.label} ${item.project}` : item.label;
    return hay.toLowerCase().includes(q);
  });
}
