<script lang="ts">
  import { gitDiff } from "$lib/ipc/git";
  import { parseDiff, type DiffFile } from "$lib/diff/parse";
  import { Badge } from "$lib/components/ui/badge";
  import * as ScrollArea from "$lib/components/ui/scroll-area";
  import FileIcon from "@lucide/svelte/icons/file";
  import FilePlus from "@lucide/svelte/icons/file-plus";
  import FileMinus from "@lucide/svelte/icons/file-minus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  interface Props {
    /** diff를 계산할 worktree 경로 */
    worktreePath: string;
  }

  let { worktreePath }: Props = $props();

  let files = $state<DiffFile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const raw = await gitDiff(worktreePath);
      files = parseDiff(raw);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      files = [];
    } finally {
      loading = false;
    }
  }

  // worktreePath가 바뀌면(=다른 에이전트 선택) 다시 로드
  $effect(() => {
    // worktreePath 의존성 명시
    void worktreePath;
    load();
  });

  const totalAdditions = $derived(files.reduce((s, f) => s + f.additions, 0));
  const totalDeletions = $derived(files.reduce((s, f) => s + f.deletions, 0));

  function fileLabel(f: DiffFile): string {
    if (f.isRenamed && f.oldPath !== f.newPath) return `${f.oldPath} → ${f.newPath}`;
    return f.path;
  }
</script>

<div class="flex h-full flex-col">
  <!-- 요약 바 -->
  <div class="flex items-center gap-3 border-b px-3 py-2 text-xs">
    <span class="font-medium">
      {files.length}개 파일 변경
    </span>
    <span class="text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>
    <span class="text-red-600 dark:text-red-400">−{totalDeletions}</span>
    <button
      class="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onclick={load}
      disabled={loading}
      title="새로고침"
    >
      <RefreshCw class="size-3 {loading ? 'animate-spin' : ''}" />
      새로고침
    </button>
  </div>

  <ScrollArea.Root class="min-h-0 flex-1">
    <div class="p-2">
      {#if loading}
        <p class="p-4 text-sm text-muted-foreground">변경사항을 불러오는 중…</p>
      {:else if error}
        <div class="m-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      {:else if files.length === 0}
        <div class="flex h-full items-center justify-center p-8">
          <p class="text-sm text-muted-foreground">변경사항이 없습니다.</p>
        </div>
      {:else}
        {#each files as file (file.path)}
          <div class="mb-3 overflow-hidden rounded-lg border">
            <!-- 파일 헤더 -->
            <div class="flex items-center gap-2 bg-muted/50 px-3 py-2 text-xs">
              {#if file.isNew}
                <FilePlus class="size-3.5 text-emerald-500" />
              {:else if file.isDeleted}
                <FileMinus class="size-3.5 text-red-500" />
              {:else}
                <FileIcon class="size-3.5 text-muted-foreground" />
              {/if}
              <span class="truncate font-mono font-medium">{fileLabel(file)}</span>
              {#if file.isNew}
                <Badge variant="secondary" class="h-4 px-1.5 text-[10px]">신규</Badge>
              {:else if file.isDeleted}
                <Badge variant="secondary" class="h-4 px-1.5 text-[10px]">삭제</Badge>
              {:else if file.isRenamed}
                <Badge variant="secondary" class="h-4 px-1.5 text-[10px]">이름변경</Badge>
              {/if}
              <span class="ml-auto shrink-0 space-x-2 font-mono">
                <span class="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                <span class="text-red-600 dark:text-red-400">−{file.deletions}</span>
              </span>
            </div>

            <!-- diff 본문 -->
            {#if file.isBinary}
              <p class="px-3 py-2 text-xs text-muted-foreground">바이너리 파일 (표시 불가)</p>
            {:else}
              <div class="overflow-x-auto">
                <table class="w-full border-collapse font-mono text-xs">
                  <tbody>
                    {#each file.hunks as hunk (hunk.header)}
                      <tr class="bg-sky-500/10 text-sky-700 dark:text-sky-300">
                        <td class="select-none px-2 text-right opacity-60" colspan="2"></td>
                        <td class="whitespace-pre px-2 py-0.5">{hunk.header}</td>
                      </tr>
                      {#each hunk.lines as ln}
                        <tr
                          class={ln.kind === "add"
                            ? "bg-emerald-500/10"
                            : ln.kind === "delete"
                              ? "bg-red-500/10"
                              : ""}
                        >
                          <td class="w-10 select-none px-2 text-right text-muted-foreground/60">
                            {ln.oldLineNo ?? ""}
                          </td>
                          <td class="w-10 select-none px-2 text-right text-muted-foreground/60">
                            {ln.newLineNo ?? ""}
                          </td>
                          <td class="whitespace-pre px-2 py-0.5">
                            <span
                              class="select-none {ln.kind === 'add'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : ln.kind === 'delete'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-transparent'}"
                              >{ln.kind === "add" ? "+" : ln.kind === "delete" ? "−" : " "}</span
                            >{ln.content}
                          </td>
                        </tr>
                      {/each}
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </ScrollArea.Root>
</div>
