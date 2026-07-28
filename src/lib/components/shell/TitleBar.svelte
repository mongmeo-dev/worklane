<script lang="ts">
  import type { Project } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import { statusCounts } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import GitFork from "@lucide/svelte/icons/git-fork";
  import ListTodo from "@lucide/svelte/icons/list-todo";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import { t } from "$lib/i18n";
  import StatusChips from "./StatusChips.svelte";
  import AttentionInbox from "./AttentionInbox.svelte";

  interface Props {
    projects: Project[];
    showRightToggle: boolean;
    onNewAgent: () => void;
    onFanout: () => void;
    onTasks: () => void;
  }

  let { projects, showRightToggle, onNewAgent, onFanout, onTasks }: Props = $props();
  const counts = $derived(statusCounts(projects));
</script>

<header class="flex h-12 shrink-0 items-center gap-3 border-b bg-background pl-20 pr-2">
  <div class="flex shrink-0 items-center gap-2">
    <Button
      variant="ghost"
      size="icon"
      class="size-[30px]"
      title={`${shell.leftPanelOpen ? t("titleBar.leftPanel.close") : t("titleBar.leftPanel.open")} · ⌘B`}
      aria-label={shell.leftPanelOpen ? t("titleBar.leftPanel.close") : t("titleBar.leftPanel.open")}
      onclick={() => shell.toggleLeftPanel()}
    >
      <PanelLeft class="size-4" />
    </Button>
    <span class="flex h-4 items-end gap-[2px]" aria-hidden="true">
      <span class="h-[13px] w-[3px] rounded-full bg-status-running"></span>
      <span class="h-[9px] w-[3px] rounded-full bg-status-blocked"></span>
      <span class="h-[11px] w-[3px] rounded-full bg-status-done"></span>
    </span>
    <span class="truncate text-sm font-semibold">Worklane</span>
  </div>

  <!-- 상태 롤업은 흐름 안의 가운데 영역에 둔다. 절대 배치는 우측 버튼군이 늘어나면 겹친다.
       에이전트가 하나도 없으면 0만 다섯 개 늘어놓는 꼴이라 감춘다. -->
  <div class="hidden min-w-0 flex-1 justify-center lg:flex">
    {#if projects.some((project) => project.agents.length > 0)}
      <StatusChips {counts} />
    {/if}
  </div>

  <div class="ml-auto flex shrink-0 items-center gap-1">
    <button
      type="button"
      class="flex h-[30px] items-center gap-2 rounded-full border bg-card px-3 text-xs text-muted-foreground transition-colors hover:border-focus-ring/40 hover:text-foreground"
      aria-label={t("titleBar.palette")}
      onclick={() => shell.togglePalette()}
    >
      <Search class="size-3.5" />
      <span class="hidden xl:inline">{t("titleBar.palette")}</span>
      <kbd class="font-mono text-2xs">⌘K</kbd>
    </button>
    <AttentionInbox {projects} />
    <Button variant="ghost" size="sm" class="h-[30px] gap-1.5 rounded-full px-3 text-xs" title={`${t("titleBar.tasks")} · ⌘⇧T`} onclick={onTasks}>
      <ListTodo class="size-4" />
      {t("titleBar.tasks")}
    </Button>
    <Button variant="outline" size="sm" class="h-[30px] gap-1.5 rounded-full bg-card px-3 text-xs" title={`${t("titleBar.newAgent")} · ⌘N`} onclick={onNewAgent} disabled={projects.length === 0}>
      <Plus class="size-4" />
      {t("titleBar.newAgent")}
    </Button>
    <Button variant="outline" size="sm" class="h-[30px] gap-1.5 rounded-full bg-card px-3 text-xs" title={`${t("titleBar.fanout")} · ⌘⇧N`} onclick={onFanout} disabled={projects.length === 0}>
      <GitFork class="size-4" />
      {t("titleBar.fanout")}
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-[30px]"
      title={`${t("titleBar.shortcuts")} · ⌘/`}
      aria-label={t("titleBar.shortcuts")}
      onclick={() => shell.toggleShortcuts()}
    >
      <Keyboard class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-[30px]"
      title={`${t("titleBar.settings")} · ⌘,`}
      aria-label={t("titleBar.settings")}
      onclick={() => settingsUi.open()}
    >
      <Settings class="size-4" />
    </Button>
    {#if showRightToggle}
      <Button
        variant="ghost"
        size="icon"
        class="size-[30px]"
        title={`${shell.rightPanelOpen ? t("titleBar.rightPanel.close") : t("titleBar.rightPanel.open")} · ⌘⌥B`}
        aria-label={shell.rightPanelOpen ? t("titleBar.rightPanel.close") : t("titleBar.rightPanel.open")}
        onclick={() => shell.toggleRightPanel()}
      >
        <PanelRight class="size-4" />
      </Button>
    {/if}
  </div>
</header>
