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

  get selectedAgentId(): string | null { return this.#selectedAgentId; }
  get overviewFilter(): OverviewFilter { return this.#overviewFilter; }
  get openFilePath(): string | null { return this.#openFilePath; }
  get showEditor(): boolean { return this.#showEditor; }
  get leftPanelOpen(): boolean { return this.#leftPanelOpen; }
  get rightPanelOpen(): boolean { return this.#rightPanelOpen; }
  get usagePopover(): string | null { return this.#usagePopover; }
  get attentionOpen(): boolean { return this.#attentionOpen; }

  selectAgent(id: string): void {
    this.#selectedAgentId = id;
    this.#openFilePath = null;
    this.#showEditor = false;
    this.#attentionOpen = false;
  }

  selectTerminal(id: string): void {
    this.#selectedAgentId = id;
    this.#showEditor = false;
  }

  goOverview(): void {
    this.#selectedAgentId = null;
    this.#openFilePath = null;
    this.#showEditor = false;
  }

  setFilter(filter: OverviewFilter): void {
    this.#overviewFilter = filter;
    this.goOverview();
  }

  openFile(path: string): void {
    this.#openFilePath = path;
    this.#showEditor = true;
  }

  showTerminal(): void {
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

  toggleAttention(): void {
    this.#attentionOpen = !this.#attentionOpen;
  }

  closeAttention(): void {
    this.#attentionOpen = false;
  }
}

export function createShellStore(): ShellStore {
  return new ShellStore();
}

export const shell = createShellStore();
