const COLLAPSED_KEY = "sidebar:collapsed-projects";

function loadCollapsed(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** 사이드바의 화면 상태(거르기 질의·프로젝트 접힘). 접힘만 영속한다. */
export class SidebarUiStore {
  #query = $state("");
  #collapsed = $state<Set<string>>(new Set(loadCollapsed()));

  get query(): string {
    return this.#query;
  }

  set query(value: string) {
    this.#query = value;
  }

  clearQuery(): void {
    this.#query = "";
  }

  /** 거르는 중에는 결과를 감추지 않도록 접힘을 무시한다. */
  isCollapsed(projectId: string): boolean {
    if (this.#query.trim() !== "") return false;
    return this.#collapsed.has(projectId);
  }

  toggleProject(projectId: string): void {
    const next = new Set(this.#collapsed);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    this.#collapsed = next;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    }
  }
}

export function createSidebarUiStore(): SidebarUiStore {
  return new SidebarUiStore();
}

export const sidebarUi = createSidebarUiStore();
