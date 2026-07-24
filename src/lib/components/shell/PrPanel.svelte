<!-- 인앱 PR 리뷰: 현재 브랜치 PR의 상태·CI 체크를 보고 병합한다(gh). -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import type { PrMergeMethod, PrStatus } from "$lib/ipc/pr";
  import { prMerge, prStatus } from "$lib/ipc/pr";
  import { logEvent } from "$lib/ipc/events";
  import { shell } from "$lib/stores/shell.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import GitPullRequest from "@lucide/svelte/icons/git-pull-request";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import Circle from "@lucide/svelte/icons/circle";

  let { agent }: { agent: Agent } = $props();

  let open = $state(false);
  let status = $state<PrStatus | null | undefined>(undefined);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);
  let busy = $state(false);
  let root = $state<HTMLElement>();

  function reason(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  async function load() {
    loading = true;
    error = null;
    try {
      status = await prStatus(agent.worktreePath);
    } catch (e) {
      status = undefined;
      error = reason(e);
    } finally {
      loading = false;
    }
  }

  async function merge(method: PrMergeMethod) {
    busy = true;
    error = null;
    note = null;
    try {
      note = await prMerge(agent.worktreePath, method);
      logEvent(agent.id, "merge", `PR #${status?.number ?? ""} ${method}`);
      shell.bumpWorktree();
      await load();
    } catch (e) {
      error = reason(e);
    } finally {
      busy = false;
    }
  }

  function conclusionTone(conclusion: string): string {
    const c = conclusion.toUpperCase();
    if (c === "SUCCESS") return "text-status-done-fg";
    if (c === "FAILURE" || c === "ERROR" || c === "CANCELLED" || c === "TIMED_OUT") return "text-diff-remove";
    if (c === "PENDING" || c === "IN_PROGRESS" || c === "QUEUED" || c === "EXPECTED") return "text-status-blocked-fg";
    return "text-muted-foreground";
  }

  function toggle() {
    open = !open;
    if (open) void load();
  }

  function outsideClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) open = false;
  }

  onMount(() => {
    window.addEventListener("click", outsideClick);
    return () => window.removeEventListener("click", outsideClick);
  });
</script>

<div bind:this={root} class="relative">
  <button
    type="button"
    class="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[10.5px] font-semibold hover:bg-accent {open ? 'bg-accent' : ''}"
    aria-label="PR 상태"
    aria-expanded={open}
    onclick={toggle}
  >
    <GitPullRequest class="size-3" />PR
  </button>

  {#if open}
    <div
      class="absolute right-0 top-[calc(100%+6px)] z-40 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      role="dialog"
      aria-label="PR 상태"
    >
      {#if loading && status === undefined}
        <p class="px-3 py-5 text-center text-[11px] text-muted-foreground">불러오는 중…</p>
      {:else if error}
        <p class="px-3.5 py-3 text-[10.5px] text-destructive">{error}</p>
      {:else if status === null}
        <p class="px-3.5 py-4 text-center text-[11px] text-muted-foreground">이 브랜치의 PR이 없습니다.</p>
      {:else if status}
        <header class="flex items-start gap-2 border-b px-3.5 py-2.5">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[12px] font-semibold">#{status.number} {status.title}</span>
            <span class="mt-0.5 flex items-center gap-1.5 text-[9.5px]">
              <span class="rounded-full bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">{status.state}</span>
              {#if status.reviewDecision}<span class="text-muted-foreground">{status.reviewDecision}</span>{/if}
              {#if status.mergeable === "CONFLICTING"}<span class="text-diff-remove">충돌</span>{/if}
            </span>
          </span>
          <button type="button" class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="브라우저에서 열기" onclick={() => openUrl(status!.url)}>
            <ExternalLink class="size-3.5" />
          </button>
        </header>

        {#if status.checks.length > 0}
          <ul class="max-h-40 overflow-auto border-b py-1">
            {#each status.checks as check (check.name + check.conclusion)}
              <li class="flex items-center gap-2 px-3.5 py-1">
                {#if check.conclusion.toUpperCase() === "SUCCESS"}
                  <Check class="size-3 shrink-0 {conclusionTone(check.conclusion)}" />
                {:else if ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT"].includes(check.conclusion.toUpperCase())}
                  <X class="size-3 shrink-0 {conclusionTone(check.conclusion)}" />
                {:else}
                  <Circle class="size-3 shrink-0 {conclusionTone(check.conclusion)}" />
                {/if}
                <span class="min-w-0 flex-1 truncate text-[11px]">{check.name}</span>
                <span class="shrink-0 text-[9.5px] {conclusionTone(check.conclusion)}">{check.conclusion || check.status}</span>
              </li>
            {/each}
          </ul>
        {/if}

        {#if error}<p class="px-3.5 py-1.5 text-[10px] text-destructive">{error}</p>{/if}
        {#if note}<p class="px-3.5 py-1.5 text-[10px] text-status-done-fg">{note}</p>{/if}

        {#if status.state === "OPEN"}
          <div class="grid grid-cols-3 gap-1.5 p-2.5">
            <button type="button" class="h-7 rounded-md bg-primary text-[10.5px] font-semibold text-primary-foreground disabled:opacity-40" disabled={busy} onclick={() => merge("squash")}>Squash</button>
            <button type="button" class="h-7 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40" disabled={busy} onclick={() => merge("merge")}>Merge</button>
            <button type="button" class="h-7 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40" disabled={busy} onclick={() => merge("rebase")}>Rebase</button>
          </div>
        {:else}
          <p class="px-3.5 py-2 text-[10.5px] text-muted-foreground">{status.state} 상태입니다.</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>
