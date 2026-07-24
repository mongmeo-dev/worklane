<script lang="ts">
  import type { Agent } from "$lib/types";
  import type { FileEntry } from "$lib/ipc/files";
  import { listWorktreeFiles } from "$lib/ipc/files";
  import { fileTotals, fileTree, type FileTreeNode } from "$lib/files/viewModel";
  import { shell } from "$lib/stores/shell.svelte";
  import { t } from "$lib/i18n";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import Folder from "@lucide/svelte/icons/folder";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ReviewActions from "./ReviewActions.svelte";

  let { agent, sharedCount = 1 }: { agent: Agent; sharedCount?: number } = $props();

  let files = $state<FileEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const tree = $derived(fileTree(files));
  const totals = $derived(fileTotals(files));

  // 접힘 상태 폴더는 여기에 없는 폴더이며, 기본은 모두 접힘(빈 집합)이다.
  let expanded = $state<Set<string>>(new Set());

  function toggleGroup(dir: string) {
    const next = new Set(expanded);
    if (next.has(dir)) next.delete(dir);
    else next.add(dir);
    expanded = next;
  }

  async function load() {
    loading = true;
    error = null;
    try {
      files = await listWorktreeFiles(agent.worktreePath);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
      files = [];
    } finally {
      loading = false;
    }
  }

  function markerClass(change: FileEntry["change"]): string {
    if (change === "new") return "bg-diff-add";
    if (change === "deleted") return "bg-diff-remove";
    if (change === "modified") return "bg-accent-share";
    return "bg-muted-foreground/30";
  }

  $effect(() => {
    void agent.worktreePath;
    void shell.worktreeRev;
    void load();
  });
</script>

{#snippet treeNode(node: FileTreeNode, depth: number)}
  {#if node.kind === "dir"}
    {@const open = expanded.has(node.path)}
    <button
      type="button"
      class="flex h-7 w-full items-center gap-1.5 rounded-[7px] pr-2 text-left transition-colors hover:bg-sidebar-accent/60"
      style="padding-left: {depth * 12 + 6}px"
      aria-expanded={open}
      onclick={() => toggleGroup(node.path)}
    >
      <ChevronRight class="size-3 shrink-0 text-muted-foreground transition-transform {open ? 'rotate-90' : ''}" />
      <Folder class="size-3 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/90">{node.name}</span>
      {#if !open && node.changed > 0}
        <span class="shrink-0 font-mono text-[8.5px]"><span class="text-diff-add">+{node.add}</span> <span class="text-diff-remove">−{node.del}</span></span>
      {/if}
    </button>
    {#if open}
      {#each node.children as child (child.path)}
        {@render treeNode(child, depth + 1)}
      {/each}
    {/if}
  {:else}
    <button
      type="button"
      class="flex h-7 w-full items-center gap-2 rounded-[7px] pr-2 text-left transition-colors {shell.openFilePath === node.path ? 'bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring' : 'hover:bg-sidebar-accent/60'}"
      style="padding-left: {depth * 12 + 10}px"
      onclick={() => shell.openFile(node.path)}
    >
      <span class="size-[7px] shrink-0 rounded-full {markerClass(node.change)}"></span>
      <span class="min-w-0 flex-1 truncate text-[11px] {node.change === 'none' ? 'text-muted-foreground' : 'font-medium text-foreground'}">{node.name}</span>
      {#if node.change !== "none"}
        <span class="shrink-0 font-mono text-[8.5px]"><span class="text-diff-add">+{node.add}</span> <span class="text-diff-remove">−{node.del}</span></span>
      {/if}
    </button>
  {/if}
{/snippet}

<aside class="flex h-full w-[264px] shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground">
  <header class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
    <h2 class="text-[12px] font-semibold">{t("filePanel.heading")}</h2>
    <span class="text-[10px] text-muted-foreground">{t("filePanel.fileCount", { count: files.length })}</span>
    <span class="ml-auto font-mono text-[9.5px] text-diff-add">+{totals.add}</span>
    <span class="font-mono text-[9.5px] text-diff-remove">−{totals.del}</span>
    <button type="button" class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label={t("filePanel.refresh")} disabled={loading} onclick={load}>
      <RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
    </button>
  </header>

  {#if sharedCount > 1}
    <div class="border-b px-3 py-2 text-[9.5px] text-accent-share">{t("filePanel.sharedNote")}</div>
  {/if}

  <ScrollArea class="min-h-0 flex-1">
    <div class="p-2">
      {#if loading}
        <p class="px-2 py-4 text-xs text-muted-foreground">{t("filePanel.loading")}</p>
      {:else if error}
        <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <p>{error}</p>
          <button type="button" class="mt-2 font-semibold underline" onclick={load}>{t("common.retry")}</button>
        </div>
      {:else if files.length === 0}
        <p class="px-2 py-6 text-center text-xs text-muted-foreground">{t("filePanel.empty")}</p>
      {:else}
        <div class="flex flex-col gap-0.5">
          {#each tree as node (node.path)}
            {@render treeNode(node, 0)}
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>

  <ReviewActions {agent} onChanged={load} />
</aside>
