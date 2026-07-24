<!-- worktree 체크포인트: 현재 상태 스냅샷 저장·롤백·삭제. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import type { Checkpoint } from "$lib/ipc/checkpoints";
  import {
    createCheckpoint,
    deleteCheckpoint,
    listCheckpoints,
    rollbackCheckpoint,
  } from "$lib/ipc/checkpoints";
  import { shell } from "$lib/stores/shell.svelte";
  import { logEvent } from "$lib/ipc/events";
  import { t, localeTag } from "$lib/i18n";
  import History from "@lucide/svelte/icons/history";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Save from "@lucide/svelte/icons/save";

  let { agent }: { agent: Agent } = $props();

  let open = $state(false);
  let list = $state<Checkpoint[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let label = $state("");
  let busy = $state(false);
  let pendingRollback = $state<string | null>(null);
  let root = $state<HTMLElement>();

  function reason(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleString(localeTag(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function loadList() {
    loading = true;
    error = null;
    try {
      list = await listCheckpoints(agent.id);
    } catch (e) {
      error = reason(e);
    } finally {
      loading = false;
    }
  }

  async function create() {
    busy = true;
    error = null;
    try {
      const cp = await createCheckpoint(agent.id, agent.worktreePath, label.trim());
      logEvent(agent.id, "checkpoint", cp.label);
      list = [cp, ...list];
      label = "";
    } catch (e) {
      error = reason(e);
    } finally {
      busy = false;
    }
  }

  async function rollback(cp: Checkpoint) {
    busy = true;
    error = null;
    try {
      await rollbackCheckpoint(agent.id, agent.worktreePath, cp.sha);
      logEvent(agent.id, "rollback", cp.label);
      shell.bumpWorktree();
      pendingRollback = null;
      await loadList();
    } catch (e) {
      error = reason(e);
    } finally {
      busy = false;
    }
  }

  async function remove(cp: Checkpoint) {
    error = null;
    try {
      await deleteCheckpoint(agent.worktreePath, cp.id);
      list = list.filter((c) => c.id !== cp.id);
    } catch (e) {
      error = reason(e);
    }
  }

  function toggle() {
    open = !open;
    if (open) void loadList();
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
    aria-label={t("checkpoints.button")}
    aria-expanded={open}
    onclick={toggle}
  >
    <History class="size-3" />{t("checkpoints.button")}
  </button>

  {#if open}
    <div
      class="absolute right-0 top-[calc(100%+6px)] z-40 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      role="dialog"
      aria-label={t("checkpoints.button")}
    >
      <div class="flex items-center gap-1.5 border-b p-2.5">
        <input
          class="min-w-0 flex-1 rounded-md border bg-input/40 px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          bind:value={label}
          placeholder={t("checkpoints.labelPlaceholder")}
          onkeydown={(e) => e.key === "Enter" && create()}
        />
        <button
          type="button"
          class="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-[10.5px] font-semibold text-primary-foreground disabled:opacity-40"
          disabled={busy}
          onclick={create}
        >
          <Save class="size-3" />{t("checkpoints.saveNow")}
        </button>
      </div>

      {#if error}
        <p class="border-b bg-destructive/10 px-3 py-1.5 text-[10px] text-destructive">{error}</p>
      {/if}

      {#if loading}
        <p class="px-3 py-5 text-center text-[11px] text-muted-foreground">{t("common.loading")}</p>
      {:else if list.length === 0}
        <p class="px-3 py-5 text-center text-[11px] text-muted-foreground">{t("checkpoints.empty")}</p>
      {:else}
        <ul class="max-h-[300px] overflow-auto py-1">
          {#each list as cp (cp.id)}
            <li class="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[11.5px] font-medium">{cp.label}</span>
                <span class="block font-mono text-[9.5px] text-muted-foreground">{formatTime(cp.createdAt)} · {cp.sha.slice(0, 7)}</span>
              </span>
              {#if pendingRollback === cp.id}
                <button type="button" class="shrink-0 rounded-md bg-status-blocked px-2 py-1 text-[10px] font-bold text-status-blocked-on disabled:opacity-50" disabled={busy} onclick={() => rollback(cp)}>{t("checkpoints.confirmRollback")}</button>
                <button type="button" class="shrink-0 rounded-md border px-1.5 py-1 text-[10px] hover:bg-accent" onclick={() => (pendingRollback = null)}>{t("common.cancel")}</button>
              {:else}
                <button type="button" class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("checkpoints.rollbackTo")} onclick={() => (pendingRollback = cp.id)}>
                  <Undo2 class="size-3.5" />
                </button>
                <button type="button" class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("checkpoints.deleteAria")} onclick={() => remove(cp)}>
                  <Trash2 class="size-3.5" />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="border-t px-3 py-1.5 text-[9.5px] text-muted-foreground">{t("checkpoints.note")}</p>
      {/if}
    </div>
  {/if}
</div>
