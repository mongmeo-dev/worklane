<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import type { OverviewFilter } from "$lib/stores/shell.svelte";
  import { allAgents } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { listWorktreeFiles } from "$lib/ipc/files";
  import { agentKindLabels } from "$lib/data/labels";
  import StatusDot from "./StatusDot.svelte";
  import { filterAgents, plainTerminalTail, tileAction } from "./overviewModel";
  import GitBranch from "@lucide/svelte/icons/git-branch";

  let { projects }: { projects: Project[] } = $props();

  const agents = $derived(allAgents(projects));
  const shownAgents = $derived(filterAgents(agents, shell.overviewFilter));
  const filters: { value: OverviewFilter; label: string }[] = [
    { value: "all", label: "전체" },
    { value: "running", label: "실행 중" },
    { value: "blocked", label: "입력 대기" },
    { value: "done", label: "완료" },
  ];

  function filterCount(filter: OverviewFilter): number {
    return filter === "all" ? agents.length : agents.filter((agent) => (agent.status ?? "idle") === filter).length;
  }

  async function openAction(event: MouseEvent, agent: Agent) {
    event.stopPropagation();
    shell.selectAgent(agent.id);
    if ((agent.status ?? "idle") !== "done") return;
    try {
      const firstChanged = (await listWorktreeFiles(agent.worktreePath)).find((file) => file.change !== "none");
      if (firstChanged) shell.openFile(firstChanged.path);
    } catch {
      // 상세 화면에서 파일 패널 오류 상태로 다시 시도할 수 있다.
    }
  }

  function tileClass(agent: Agent): string {
    const status = agent.status ?? "idle";
    if (status === "blocked") return "border-status-blocked/55 shadow-[0_0_24px_color-mix(in_oklch,var(--status-blocked)_10%,transparent)]";
    if (status === "idle") return "opacity-70";
    if (status === "done") return "opacity-90";
    return "";
  }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-[22px] pb-[22px] pt-[18px]">
  <header class="flex shrink-0 items-center gap-2">
    <div>
      <h1 class="text-[15px] font-bold">전체 오버뷰</h1>
      <p class="mt-0.5 text-[10.5px] text-muted-foreground">{agents.length}개 에이전트 · {projects.length}개 프로젝트</p>
    </div>
    <div class="ml-auto flex items-center gap-1 rounded-full border bg-card/70 p-0.5">
      {#each filters as filter (filter.value)}
        <button
          type="button"
          class="rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors {shell.overviewFilter === filter.value ? 'bg-accent text-foreground' : filter.value === 'blocked' ? 'text-status-blocked-fg' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => shell.setFilter(filter.value)}
        >
          {filter.label}{filter.value === "blocked" && filterCount(filter.value) > 0 ? ` ${filterCount(filter.value)}` : ""}
        </button>
      {/each}
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if shownAgents.length > 0}
      <div class="grid min-h-full auto-rows-[minmax(210px,1fr)] grid-cols-[repeat(auto-fit,minmax(245px,1fr))] gap-[13px]">
        {#each shownAgents as agent (agent.id)}
          {@const status = agent.status ?? "idle"}
          {@const tail = plainTerminalTail(sessionStatus.tail(agent.id))}
          <div
            class="flex min-h-[210px] cursor-pointer flex-col overflow-hidden rounded-xl border bg-tile p-3 transition-[transform,border-color,opacity] hover:-translate-y-0.5 hover:border-ring {tileClass(agent)}"
            onclick={() => shell.selectAgent(agent.id)}
            onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") shell.selectAgent(agent.id); }}
            role="button"
            tabindex="0"
          >
            <div class="flex items-center gap-2">
              <StatusDot {status} size={7} />
              <h2 class="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{agent.title}</h2>
              <span class="font-mono text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">{agentKindLabels[agent.kind]}</span>
            </div>
            <div class="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
              <GitBranch class="size-3" />
              <span class="truncate">{agent.branch}</span>
            </div>
            <div class="mt-3 flex min-h-0 flex-1 items-end overflow-hidden rounded-lg border border-white/5 bg-terminal p-3 font-mono text-[10.5px] leading-[1.65] text-white/70">
              <pre class="max-h-full w-full whitespace-pre-wrap">{tail || `$ ${agent.command}\n세션을 열면 최근 출력이 표시됩니다.`}</pre>
            </div>
            <footer class="mt-2.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
              {#if status === "blocked"}
                <span class="rounded-full bg-status-blocked px-2 py-0.5 font-semibold text-status-blocked-on">입력 대기</span>
              {:else}
                <span>{agent.lastActivity ?? "대기 중"}</span>
              {/if}
              <button
                type="button"
                class="ml-auto rounded-full px-2.5 py-1 font-semibold {status === 'blocked' ? 'bg-status-blocked text-status-blocked-on' : status === 'done' ? 'text-status-done-fg' : 'text-foreground'}"
                onclick={(event) => openAction(event, agent)}
              >{tileAction(status)}</button>
            </footer>
          </div>
        {/each}
      </div>
    {:else}
      <div class="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed">
        <div class="text-center">
          <p class="text-sm font-medium">표시할 에이전트가 없습니다.</p>
          <button type="button" class="mt-2 text-xs text-accent-share" onclick={() => shell.setFilter("all")}>전체 에이전트 보기</button>
        </div>
      </div>
    {/if}
  </div>
</section>
