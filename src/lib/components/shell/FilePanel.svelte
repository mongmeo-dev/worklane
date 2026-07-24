<script lang="ts">
  import type { Agent } from "$lib/types";
  import type { FileEntry } from "$lib/ipc/files";
  import { listWorktreeFiles } from "$lib/ipc/files";
  import { fileGroups, fileTotals } from "$lib/files/viewModel";
  import { shell } from "$lib/stores/shell.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import Folder from "@lucide/svelte/icons/folder";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ReviewActions from "./ReviewActions.svelte";

  let { agent, sharedCount = 1 }: { agent: Agent; sharedCount?: number } = $props();

  let files = $state<FileEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const groups = $derived(fileGroups(files));
  const totals = $derived(fileTotals(files));

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
    void load();
  });
</script>

<aside class="flex h-full w-[264px] shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground">
  <header class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
    <h2 class="text-[12px] font-semibold">파일</h2>
    <span class="text-[10px] text-muted-foreground">{files.length}개 파일</span>
    <span class="ml-auto font-mono text-[9.5px] text-diff-add">+{totals.add}</span>
    <span class="font-mono text-[9.5px] text-diff-remove">−{totals.del}</span>
    <button type="button" class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label="파일 목록 새로고침" disabled={loading} onclick={load}>
      <RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
    </button>
  </header>

  {#if sharedCount > 1}
    <div class="border-b px-3 py-2 text-[9.5px] text-accent-share">공유 worktree의 변경사항을 합산해 표시합니다.</div>
  {/if}

  <ScrollArea class="min-h-0 flex-1">
    <div class="p-2">
      {#if loading}
        <p class="px-2 py-4 text-xs text-muted-foreground">파일을 불러오는 중…</p>
      {:else if error}
        <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <p>{error}</p>
          <button type="button" class="mt-2 font-semibold underline" onclick={load}>다시 시도</button>
        </div>
      {:else if files.length === 0}
        <p class="px-2 py-6 text-center text-xs text-muted-foreground">표시할 파일이 없습니다.</p>
      {:else}
        <div class="flex flex-col gap-2.5">
          {#each groups as group (group.dir)}
            <section>
              <h3 class="flex items-center gap-1.5 px-1.5 py-1 font-mono text-[9.5px] font-medium text-muted-foreground">
                <Folder class="size-3" /><span class="truncate">{group.label}</span>
              </h3>
              <div class="flex flex-col gap-0.5">
                {#each group.files as file (file.path)}
                  <button
                    type="button"
                    class="flex h-7 w-full items-center gap-2 rounded-[7px] px-2 text-left transition-colors {shell.openFilePath === file.path ? 'bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring' : 'hover:bg-sidebar-accent/60'}"
                    onclick={() => shell.openFile(file.path)}
                  >
                    <span class="size-[7px] shrink-0 rounded-full {markerClass(file.change)}"></span>
                    <span class="min-w-0 flex-1 truncate text-[11px] {file.change === 'none' ? 'text-muted-foreground' : 'font-medium text-foreground'}">{file.name}</span>
                    {#if file.change !== "none"}
                      <span class="shrink-0 font-mono text-[8.5px]"><span class="text-diff-add">+{file.add}</span> <span class="text-diff-remove">−{file.del}</span></span>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>

  <ReviewActions {agent} onChanged={load} />
</aside>
