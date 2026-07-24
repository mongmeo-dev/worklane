<script lang="ts">
  import type { Agent } from "$lib/types";
  import type { DiffLine, FileContent, FileEntry } from "$lib/ipc/files";
  import { gitFileDiff, listWorktreeFiles, readWorktreeFile } from "$lib/ipc/files";
  import { sourceLines } from "$lib/files/viewModel";
  import { shell } from "$lib/stores/shell.svelte";

  let { agent, path, sharedCount = 1 }: { agent: Agent; path: string; sharedCount?: number } = $props();

  let content = $state<FileContent | null>(null);
  let entry = $state<FileEntry | undefined>();
  let diff = $state<DiffLine[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let requestId = 0;
  const lines = $derived(content ? sourceLines(content.content) : []);

  async function load() {
    const current = ++requestId;
    loading = true;
    error = null;
    const [fileResult, diffResult, listResult] = await Promise.allSettled([
      readWorktreeFile(agent.worktreePath, path),
      gitFileDiff(agent.worktreePath, path),
      listWorktreeFiles(agent.worktreePath),
    ]);
    if (current !== requestId) return;
    content = fileResult.status === "fulfilled" ? fileResult.value : null;
    diff = diffResult.status === "fulfilled" ? diffResult.value : [];
    entry = listResult.status === "fulfilled" ? listResult.value.find((file) => file.path === path) : undefined;
    if (!content && diff.length === 0) {
      const reason = fileResult.status === "rejected" ? fileResult.reason : diffResult.status === "rejected" ? diffResult.reason : "파일을 읽을 수 없습니다.";
      error = reason instanceof Error ? reason.message : String(reason);
    }
    loading = false;
  }

  function rowClass(kind: DiffLine["kind"]): string {
    if (kind === "add") return "bg-diff-add/7 text-diff-add";
    if (kind === "del") return "bg-diff-remove/7 text-diff-remove";
    return "text-white/72";
  }

  $effect(() => {
    void agent.worktreePath;
    void shell.worktreeRev;
    void path;
    void load();
  });
</script>

<div class="flex h-full min-h-0 flex-col bg-editor text-white/80">
  <header class="flex h-10 shrink-0 items-center gap-2 border-b border-white/8 bg-editor-chrome px-3 font-mono text-[10px]">
    <span class="min-w-0 flex-1 truncate">{path}</span>
    {#if entry?.change && entry.change !== "none"}
      <span class="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px]">{entry.change === "new" ? "신규" : entry.change === "deleted" ? "삭제" : "수정"}</span>
      {#if sharedCount > 1}<span class="text-accent-share">마지막 수정 · {agent.title}</span>{/if}
      <span class="text-diff-add">+{entry.add}</span><span class="text-diff-remove">−{entry.del}</span>
    {/if}
  </header>

  <div class="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-[1.75]">
    {#if loading}
      <p class="p-4 text-white/45">파일을 불러오는 중…</p>
    {:else if error}
      <div class="m-3 rounded-lg border border-diff-remove/30 bg-diff-remove/10 p-3 text-diff-remove">{error}</div>
    {:else if content?.isBinary}
      <div class="grid h-full place-items-center text-white/45">바이너리 파일은 미리 볼 수 없습니다.</div>
    {:else if diff.length > 0}
      <table class="w-full border-collapse">
        <tbody>
          {#each diff as line, index (`${line.oldNo}-${line.newNo}-${index}`)}
            <tr class={rowClass(line.kind)}>
              <td class="w-11 select-none border-r border-white/5 px-2 text-right text-white/25">{line.oldNo ?? ""}</td>
              <td class="w-11 select-none border-r border-white/5 px-2 text-right text-white/25">{line.newNo ?? ""}</td>
              <td class="whitespace-pre px-3"><span class="mr-2 select-none opacity-70">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>{line.text}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <table class="w-full border-collapse">
        <tbody>
          {#each lines as line (line.no)}
            <tr>
              <td class="w-11 select-none border-r border-white/5 px-2 text-right text-white/25">{line.no}</td>
              <td class="whitespace-pre px-3 text-white/72">{line.text || " "}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <footer class="flex h-7 shrink-0 items-center border-t border-white/8 bg-editor-chrome px-3 font-mono text-[9px] text-white/35">
    읽기 전용 미리보기 · worktree 파일 <span class="ml-auto">{agent.branch}</span>
  </footer>
</div>
