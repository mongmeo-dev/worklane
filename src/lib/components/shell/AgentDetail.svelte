<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import { agentKindLabels } from "$lib/data/labels";
  import { agentsForWorktree } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import StatusDot from "./StatusDot.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import Terminal from "./Terminal.svelte";
  import FileViewer from "./FileViewer.svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";

  let { agent, projects }: { agent: Agent; projects: Project[] } = $props();
  const sharedAgents = $derived(agentsForWorktree(projects, agent));
  const status = $derived(agent.status ?? "idle");
</script>

<section class="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-hidden px-[18px] pb-[18px] pt-[14px]">
  <header class="flex shrink-0 items-center gap-2.5">
    <button type="button" class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="전체 오버뷰로 돌아가기" onclick={() => shell.goOverview()}>
      <ArrowLeft class="size-4" />
    </button>
    <StatusDot {status} size={10} />
    <h1 class="min-w-0 truncate text-base font-bold">{agent.title}</h1>
    <span class="rounded-full bg-muted px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase text-muted-foreground">{agentKindLabels[agent.kind]}</span>
    <span class="flex min-w-0 items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
      <GitBranch class="size-3" /><span class="truncate">{agent.branch}</span>
    </span>
    {#if sharedAgents.length > 1}
      <span class="rounded-full bg-accent-share/10 px-2 py-0.5 text-[10px] font-semibold text-accent-share">공유 worktree · {sharedAgents.length} 에이전트</span>
    {/if}
    <span class="ml-auto text-[10.5px] text-muted-foreground">{agent.lastActivity ?? "대기 중"}</span>
    <StatusBadge {status} />
  </header>

  {#if status === "blocked"}
    <div class="flex shrink-0 items-center gap-3 rounded-[11px] border border-status-blocked/30 bg-status-blocked/8 px-3.5 py-2.5">
      <TriangleAlert class="size-4 text-status-blocked" />
      <div class="min-w-0 flex-1">
        <p class="text-[12.5px] font-semibold text-status-blocked-fg">에이전트가 입력을 기다리고 있어요</p>
        <p class="mt-0.5 text-[10.5px] text-muted-foreground">터미널에서 응답하면 작업이 계속됩니다.</p>
      </div>
      <button type="button" class="rounded-full bg-status-blocked px-3 py-1.5 text-[10.5px] font-bold text-status-blocked-on" onclick={() => shell.showTerminal()}>터미널로 이동</button>
    </div>
  {/if}

  <div class="flex shrink-0 items-end gap-1 border-b">
    {#each sharedAgents as shared (shared.id)}
      <button
        type="button"
        class="border-b-2 px-3 pb-2 pt-1 text-[11.5px] font-medium {shared.id === agent.id && !shell.showEditor ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => shell.selectAgent(shared.id)}
      >터미널{sharedAgents.length > 1 ? ` · ${agentKindLabels[shared.kind]}` : ""}</button>
    {/each}
    {#if shell.openFilePath}
      <button type="button" class="flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[11.5px] font-medium {shell.showEditor ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}" onclick={() => shell.openFile(shell.openFilePath!)}>
        <span class="max-w-40 truncate">{shell.openFilePath.split("/").at(-1)}</span>
        <span role="button" tabindex="0" aria-label="파일 탭 닫기" class="rounded p-0.5 hover:bg-muted" onclick={(event) => { event.stopPropagation(); shell.closeFile(); }} onkeydown={(event) => { if (event.key === "Enter") shell.closeFile(); }}><X class="size-3" /></span>
      </button>
    {/if}
  </div>

  <div class="min-h-0 flex-1 overflow-hidden rounded-xl border {status === 'blocked' && !shell.showEditor ? 'border-status-blocked/30 shadow-[0_0_20px_color-mix(in_oklch,var(--status-blocked)_8%,transparent)]' : ''}">
    {#if shell.showEditor && shell.openFilePath}
      <FileViewer {agent} path={shell.openFilePath} sharedCount={sharedAgents.length} />
    {:else}
      {#key agent.id}
        <div class="flex h-full flex-col bg-terminal p-1.5">
          <div class="min-h-0 flex-1"><Terminal sessionId={agent.id} cmd={agent.command} cwd={agent.worktreePath} /></div>
          <div class="shrink-0 px-2 py-1 font-mono text-[9.5px] text-white/35">esc 중단 · ⌥⏎ 줄바꿈</div>
        </div>
      {/key}
    {/if}
  </div>
</section>
