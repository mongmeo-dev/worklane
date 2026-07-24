export type OverviewFilter = "all" | "running" | "blocked" | "done";

const LEFT_KEY = "shell:left-open";
const RIGHT_KEY = "shell:right-open";

function loadBoolean(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value === null ? fallback : value !== "false";
}

export class ShellStore {
  #selectedAgentId = $state<string | null>(null);
  #overviewFilter = $state<OverviewFilter>("all");
  #openFilePath = $state<string | null>(null);
  #showEditor = $state(false);
  #leftPanelOpen = $state(loadBoolean(LEFT_KEY, true));
  #rightPanelOpen = $state(loadBoolean(RIGHT_KEY, true));
  #usagePopover = $state<string | null>(null);
  #attentionOpen = $state(false);
  #compareGroupId = $state<string | null>(null);
  #showPreview = $state(false);
  #worktreeRev = $state(0);
  #paletteOpen = $state(false);

  get selectedAgentId(): string | null { return this.#selectedAgentId; }
  get overviewFilter(): OverviewFilter { return this.#overviewFilter; }
  get openFilePath(): string | null { return this.#openFilePath; }
  get showEditor(): boolean { return this.#showEditor; }
  get leftPanelOpen(): boolean { return this.#leftPanelOpen; }
  get rightPanelOpen(): boolean { return this.#rightPanelOpen; }
  get usagePopover(): string | null { return this.#usagePopover; }
  get attentionOpen(): boolean { return this.#attentionOpen; }
  get compareGroupId(): string | null { return this.#compareGroupId; }
  get showPreview(): boolean { return this.#showPreview; }
  get worktreeRev(): number { return this.#worktreeRev; }
  get paletteOpen(): boolean { return this.#paletteOpen; }

  selectAgent(id: string): void {
    this.#selectedAgentId = id;
    this.#openFilePath = null;
    this.#showEditor = false;
    this.#showPreview = false;
    this.#attentionOpen = false;
    this.#compareGroupId = null;
    this.#paletteOpen = false;
  }

  selectTerminal(id: string): void {
    this.#selectedAgentId = id;
    this.#showEditor = false;
    this.#showPreview = false;
  }

  goOverview(): void {
    this.#selectedAgentId = null;
    this.#openFilePath = null;
    this.#showEditor = false;
    this.#showPreview = false;
  }

  setFilter(filter: OverviewFilter): void {
    this.#overviewFilter = filter;
    this.goOverview();
  }

  openFile(path: string): void {
    this.#openFilePath = path;
    this.#showEditor = true;
    this.#showPreview = false;
  }

  showTerminal(): void {
    this.#showEditor = false;
    this.#showPreview = false;
  }

  showPreviewPane(): void {
    this.#showPreview = true;
    this.#showEditor = false;
  }

  closeFile(): void {
    this.#openFilePath = null;
    this.#showEditor = false;
  }

  toggleLeftPanel(): void {
    this.#leftPanelOpen = !this.#leftPanelOpen;
    localStorage.setItem(LEFT_KEY, String(this.#leftPanelOpen));
  }

  toggleRightPanel(): void {
    this.#rightPanelOpen = !this.#rightPanelOpen;
    localStorage.setItem(RIGHT_KEY, String(this.#rightPanelOpen));
  }

  toggleUsagePopover(provider: string): void {
    this.#usagePopover = this.#usagePopover === provider ? null : provider;
  }

  closeUsagePopover(): void {
    this.#usagePopover = null;
  }

  /** worktree 파일 상태가 외부(롤백 등)로 바뀌었음을 알려 관련 뷰를 재로딩시킨다. */
  bumpWorktree(): void {
    this.#worktreeRev += 1;
  }

  togglePalette(): void {
    this.#paletteOpen = !this.#paletteOpen;
  }

  closePalette(): void {
    this.#paletteOpen = false;
  }

  toggleAttention(): void {
    this.#attentionOpen = !this.#attentionOpen;
  }

  closeAttention(): void {
    this.#attentionOpen = false;
  }

  openCompare(groupId: string): void {
    this.#compareGroupId = groupId;
    this.#attentionOpen = false;
  }

  closeCompare(): void {
    this.#compareGroupId = null;
  }
}

export function createShellStore(): ShellStore {
  return new ShellStore();
}

export const shell = createShellStore();
