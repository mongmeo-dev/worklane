<!-- ⌘K 명령 팔레트: 에이전트/전역 액션을 퍼지 검색·실행한다. -->
<script lang="ts">
  import type { Project } from "$lib/types";
  import { shell } from "$lib/stores/shell.svelte";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import { composer } from "$lib/stores/composer.svelte";
  import { projectDialogUi } from "$lib/stores/projectDialogUi.svelte";
  import { nextAttentionAgentId } from "$lib/shell/derived";
  import { agentItems, filterPalette, paletteActions, type PaletteItem } from "$lib/palette/model";
  import StatusDot from "./StatusDot.svelte";
  import Search from "@lucide/svelte/icons/search";
  import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import { t, type MessageKey } from "$lib/i18n";

  let { projects, onNewAgent, onTasks }: {
    projects: Project[];
    onNewAgent: () => void;
    onTasks: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let inputEl = $state<HTMLInputElement>();
  let listEl = $state<HTMLUListElement>();

  const items = $derived([...paletteActions(), ...agentItems(projects)]);
  const recentIds = $derived(shell.recentAgentIds);
  const filtered = $derived(filterPalette(items, query, recentIds));
  const grouped = $derived(query.trim() === "");

  /** 빈 질의일 때만 구역을 나눈다. 검색 중에는 점수 순서를 흐리지 않는다. */
  function groupKeyOf(item: PaletteItem): MessageKey | null {
    if (!grouped) return null;
    if (item.type === "agent" && recentIds.includes(item.id)) return "palette.recent";
    return item.type === "action" ? "palette.group.actions" : "palette.group.agents";
  }

  // 열릴 때마다 상태 초기화 + 포커스.
  $effect(() => {
    if (shell.paletteOpen) {
      query = "";
      index = 0;
      queueMicrotask(() => inputEl?.focus());
    }
  });

  // 필터 변경 시 선택 인덱스를 범위 안으로 고정.
  $effect(() => {
    if (index >= filtered.length) index = Math.max(0, filtered.length - 1);
  });

  // 키보드로 목록 밖까지 내려가면 따라 스크롤한다.
  $effect(() => {
    const active = listEl?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    active?.scrollIntoView({ block: "nearest" });
  });

  function run(item: PaletteItem) {
    if (item.type === "agent") {
      shell.selectAgent(item.id);
      return;
    }
    switch (item.id) {
      case "overview":
        shell.goOverview();
        break;
      case "settings":
        settingsUi.open();
        break;
      case "fanout":
        composer.openFanout();
        break;
      case "newAgent":
        onNewAgent();
        break;
      case "newProject":
        projectDialogUi.open();
        break;
      case "tasks":
        onTasks();
        break;
      case "attention": {
        const next = nextAttentionAgentId(projects, shell.selectedAgentId);
        if (next) shell.selectAgent(next);
        break;
      }
      case "shortcuts":
        shell.toggleShortcuts();
        return;
    }
    shell.closePalette();
  }

  function onKey(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      index = filtered.length === 0 ? 0 : (index + 1) % filtered.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      index = filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length;
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[index];
      if (item) run(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      shell.closePalette();
    }
  }
</script>

{#if shell.paletteOpen}
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-background/60 pt-[12vh] backdrop-blur-sm">
    <button
      type="button"
      class="absolute inset-0 cursor-default"
      aria-label={t("palette.footer.close")}
      tabindex="-1"
      onclick={() => shell.closePalette()}
    ></button>
    <div
      class="relative flex max-h-[70vh] w-[600px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.aria")}
    >
      <div class="flex shrink-0 items-center gap-2.5 border-b px-3.5">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKey}
          class="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          placeholder={t("palette.placeholder")}
          aria-label={t("palette.aria")}
          aria-controls="palette-list"
          aria-activedescendant={filtered[index] ? `palette-item-${index}` : undefined}
          role="combobox"
          aria-expanded="true"
          spellcheck="false"
          autocomplete="off"
        />
      </div>

      {#if filtered.length > 0}
        <ul bind:this={listEl} id="palette-list" role="listbox" aria-label={t("palette.aria")} class="min-h-0 flex-1 overflow-auto py-1">
          {#each filtered as item, i (item.type + item.id)}
            {@const groupKey = groupKeyOf(item)}
            {@const prevKey = i === 0 ? null : groupKeyOf(filtered[i - 1])}
            {#if groupKey !== null && groupKey !== prevKey}
              <li role="presentation" class="px-3.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(groupKey)}
              </li>
            {/if}
            <li role="option" id={`palette-item-${i}`} aria-selected={i === index} data-index={i}>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors {i === index ? 'bg-accent' : 'hover:bg-accent/60'}"
                tabindex="-1"
                onmousemove={() => (index = i)}
                onclick={() => run(item)}
              >
                {#if item.type === "agent"}
                  <StatusDot status={item.status} size={7} />
                  <span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                  <span class="flex min-w-0 shrink items-center gap-1 text-2xs text-muted-foreground">
                    <GitBranch class="size-3 shrink-0" />
                    <span class="min-w-0 truncate font-mono">{item.branch}</span>
                  </span>
                  <span class="shrink-0 text-2xs text-muted-foreground">{item.project}</span>
                {:else}
                  <span class="size-[7px] shrink-0"></span>
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                  <span class="shrink-0 text-2xs text-muted-foreground">{item.hint}</span>
                  {#if item.shortcut}
                    <kbd class="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{item.shortcut}</kbd>
                  {/if}
                {/if}
                {#if i === index}<CornerDownLeft class="size-3 shrink-0 text-muted-foreground" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="px-3.5 py-8 text-center text-xs text-muted-foreground">{t("palette.empty")}</p>
      {/if}

      <div class="flex shrink-0 items-center gap-4 border-t px-3.5 py-2 text-2xs text-muted-foreground">
        <span class="flex items-center gap-1.5"><kbd class="rounded border border-border bg-muted px-1 font-mono">↑↓</kbd>{t("palette.footer.navigate")}</span>
        <span class="flex items-center gap-1.5"><kbd class="rounded border border-border bg-muted px-1 font-mono">↵</kbd>{t("palette.footer.open")}</span>
        <span class="flex items-center gap-1.5"><kbd class="rounded border border-border bg-muted px-1 font-mono">esc</kbd>{t("palette.footer.close")}</span>
      </div>
    </div>
  </div>
{/if}
