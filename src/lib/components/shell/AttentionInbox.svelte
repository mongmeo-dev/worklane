<script lang="ts">
  import type { Project } from "$lib/types";
  import { onMount } from "svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { attentionCounts, attentionItems } from "$lib/attention/model";
  import { statusLabel } from "$lib/data/labels";
  import { t } from "$lib/i18n";
  import Bell from "@lucide/svelte/icons/bell";
  import GitBranch from "@lucide/svelte/icons/git-branch";

  let { projects }: { projects: Project[] } = $props();
  let root = $state<HTMLElement>();

  const items = $derived(attentionItems(projects));
  const counts = $derived(attentionCounts(items));

  function select(agentId: string) {
    shell.selectAgent(agentId);
  }

  function outsideClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) shell.closeAttention();
  }

  onMount(() => {
    window.addEventListener("click", outsideClick);
    return () => window.removeEventListener("click", outsideClick);
  });
</script>

<div bind:this={root} class="relative">
  <button
    type="button"
    class="relative flex size-[30px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {shell.attentionOpen ? 'bg-accent text-foreground' : ''}"
    aria-label={counts.total > 0 ? t("attention.openCount", { count: counts.total }) : t("attention.bell")}
    aria-expanded={shell.attentionOpen}
    onclick={() => shell.toggleAttention()}
  >
    <Bell class="size-4" />
    {#if counts.total > 0}
      <span
        class="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none {counts.blocked > 0 ? 'bg-status-blocked text-status-blocked-on' : 'bg-status-done text-background'}"
      >{counts.total}</span>
    {/if}
  </button>

  {#if shell.attentionOpen}
    <div
      class="absolute right-0 top-[calc(100%+8px)] z-40 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      role="dialog"
      aria-label={t("attention.inboxAria")}
    >
      <header class="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 class="text-[12.5px] font-semibold">{t("attention.heading")}</h2>
        <span class="text-[10px] text-muted-foreground">{t("attention.allProjects")}</span>
        {#if counts.total > 0}
          <span class="ml-auto flex items-center gap-2 font-mono text-[10px]">
            {#if counts.failed > 0}<span class="text-destructive">{t("attention.failedCount", { count: counts.failed })}</span>{/if}
            {#if counts.blocked > 0}<span class="text-status-blocked-fg">{t("attention.blockedCount", { count: counts.blocked })}</span>{/if}
            {#if counts.done > 0}<span class="text-status-done-fg">{t("attention.doneCount", { count: counts.done })}</span>{/if}
          </span>
        {/if}
      </header>

      {#if items.length > 0}
        <ul class="max-h-[360px] overflow-auto py-1">
          {#each items as item (item.agentId)}
            <li>
              <button
                type="button"
                class="flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-accent"
                onclick={() => select(item.agentId)}
              >
                <span
                  class="mt-1 size-1.5 shrink-0 rounded-full {item.status === 'failed'
                    ? 'bg-destructive'
                    : item.status === 'blocked'
                      ? 'bg-status-blocked status-ring-anim animate-[status-ring-pulse_1.8s_ease-out_infinite]'
                      : 'bg-status-done'}"
                ></span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.agentTitle}</span>
                    <span
                      class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold {item.status === 'failed'
                        ? 'bg-destructive/10 text-destructive'
                        : item.status === 'blocked'
                          ? 'bg-status-blocked text-status-blocked-on'
                          : 'bg-status-done/10 text-status-done-fg'}"
                    >{statusLabel(item.status)}</span>
                  </span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span class="truncate">{item.projectName}</span>
                    <span class="opacity-40">·</span>
                    <GitBranch class="size-3 shrink-0" />
                    <span class="truncate font-mono">{item.branch}</span>
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
          {t("attention.empty")}
        </p>
      {/if}
    </div>
  {/if}
</div>
