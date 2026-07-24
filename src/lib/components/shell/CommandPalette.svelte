<!-- ⌘K 명령 팔레트: 에이전트/전역 액션을 빠르게 검색·실행한다. -->
<script lang="ts">
  import type { Project } from "$lib/types";
  import { shell } from "$lib/stores/shell.svelte";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import { composer } from "$lib/stores/composer.svelte";
  import { agentItems, filterPalette, PALETTE_ACTIONS, type PaletteItem } from "$lib/palette/model";
  import StatusDot from "./StatusDot.svelte";
  import Search from "@lucide/svelte/icons/search";
  import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";

  let { projects, onNewAgent, onTasks }: {
    projects: Project[];
    onNewAgent: () => void;
    onTasks: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let inputEl = $state<HTMLInputElement>();

  const items = $derived([...PALETTE_ACTIONS, ...agentItems(projects)]);
  const filtered = $derived(filterPalette(items, query));

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

  function run(item: PaletteItem) {
    if (item.type === "agent") {
      shell.selectAgent(item.id);
    } else {
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
        case "tasks":
          onTasks();
          break;
      }
    }
    shell.closePalette();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      index = Math.min(index + 1, filtered.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      index = Math.max(index - 1, 0);
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
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
    role="button"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) shell.closePalette();
    }}
    onkeydown={() => {}}
  >
    <div class="w-[560px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div class="flex items-center gap-2 border-b px-3.5">
        <Search class="size-4 text-muted-foreground" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKey}
          class="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          placeholder="에이전트 이동 또는 명령 검색…"
          aria-label="명령 팔레트"
          spellcheck="false"
        />
        <kbd class="rounded border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">Esc</kbd>
      </div>

      {#if filtered.length > 0}
        <ul class="max-h-[52vh] overflow-auto py-1">
          {#each filtered as item, i (item.type + item.id)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left {i === index ? 'bg-accent' : 'hover:bg-accent/60'}"
                onmousemove={() => (index = i)}
                onclick={() => run(item)}
              >
                {#if item.type === "agent"}
                  <StatusDot status={item.status} size={7} />
                  <span class="min-w-0 flex-1 truncate text-[12.5px]">{item.label}</span>
                  <span class="shrink-0 text-[10px] text-muted-foreground">{item.project}</span>
                {:else}
                  <span class="grid size-[7px] place-items-center"></span>
                  <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium">{item.label}</span>
                  <span class="shrink-0 text-[10px] text-muted-foreground">{item.hint}</span>
                {/if}
                {#if i === index}<CornerDownLeft class="size-3 shrink-0 text-muted-foreground" />{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="px-3.5 py-6 text-center text-[12px] text-muted-foreground">결과가 없습니다.</p>
      {/if}
    </div>
  </div>
{/if}
