import type { AgentStatus, Project } from "$lib/types";

export type PaletteItem =
  | { type: "action"; id: string; label: string; hint: string }
  | { type: "agent"; id: string; label: string; project: string; status: AgentStatus };

/** 기본 액션 항목(에이전트 외 전역 명령). */
export const PALETTE_ACTIONS: PaletteItem[] = [
  { type: "action", id: "overview", label: "전체 오버뷰", hint: "이동" },
  { type: "action", id: "newAgent", label: "새 에이전트", hint: "생성" },
  { type: "action", id: "fanout", label: "팬아웃", hint: "생성" },
  { type: "action", id: "tasks", label: "태스크 보드", hint: "열기" },
  { type: "action", id: "settings", label: "설정", hint: "열기" },
];

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
