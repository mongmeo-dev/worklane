<script lang="ts">
  import type { Agent, AgentTerminal, Project } from "$lib/types";
  import { onMount } from "svelte";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { agentsForWorktree } from "$lib/shell/derived";
  import { groupOf } from "$lib/fanout/model";
  import { shell } from "$lib/stores/shell.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { agentDetection } from "$lib/stores/agentDetection.svelte";
  import { BLANK_TERMINAL_KIND } from "$lib/data/labels";
  import { t } from "$lib/i18n";
  import StatusDot from "./StatusDot.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import Terminal from "./Terminal.svelte";
  import OpenExternal from "./OpenExternal.svelte";
  import Checkpoints from "./Checkpoints.svelte";
  import Timeline from "./Timeline.svelte";
  import PrPanel from "./PrPanel.svelte";
  import FileViewer from "./FileViewer.svelte";
  import Preview from "./Preview.svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";
  import Plus from "@lucide/svelte/icons/plus";
  import GitFork from "@lucide/svelte/icons/git-fork";

  let { agent, projects }: { agent: Agent; projects: Project[] } = $props();
  const sharedAgents = $derived(agentsForWorktree(projects, agent));
  const group = $derived(agent.groupId ? groupOf(projects, agent.groupId) : undefined);
  const status = $derived(agent.status ?? "idle");

  // 워크스페이스(=worktree) 안의 터미널 탭들. 주 터미널 개념 없이 모두 동등하다.
  const terminals = $derived(agent.terminals ?? []);
  // 활성 탭: 선택된 탭이 이 워크스페이스에 속하면 그것, 아니면 첫 터미널.
  const activeTerminal = $derived<AgentTerminal | undefined>(
    terminals.find((tm) => tm.id === shell.selectedTerminalId) ?? terminals[0],
  );
  const showTerminal = $derived(!shell.showEditor && !shell.showPreview);

  let pickerOpen = $state(false);

  // 탭에 붙일 종류: 런타임 감지가 우선, 없으면 열 때 고른 프리셋.
  function tabKindId(term: AgentTerminal): string {
    return agentDetection.get(term.id) ?? term.kind;
  }
  function tabLabel(term: AgentTerminal): string {
    const kindId = tabKindId(term);
    if (!kindId || kindId === BLANK_TERMINAL_KIND) return t("agentDetail.terminal");
    return agentKindStore.labelOf(kindId);
  }

  async function addTerminal(kindId: string): Promise<void> {
    pickerOpen = false;
    const command = agentKindStore.defaultCommandOf(kindId);
    const term = await projectStore.addTerminal(agent.id, kindId, command, "");
    shell.selectTab(term.id);
  }

  async function closeTerminal(term: AgentTerminal, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const wasActive = activeTerminal?.id === term.id;
    const rest = terminals.filter((tm) => tm.id !== term.id);
    await projectStore.removeTerminal(agent.id, term.id);
    agentDetection.forget(term.id);
    if (wasActive) shell.selectTab(rest[0]?.id ?? agent.id);
  }

  // 활성 워크스페이스의 터미널들에서 실제 도는 에이전트를 주기적으로 감지한다.
  onMount(() => {
    const tick = () => agentDetection.refreshAll(terminals.map((tm) => tm.id));
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  });
</script>

<section class="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-hidden px-[18px] pb-[18px] pt-[14px]">
  <header class="flex shrink-0 items-center gap-2.5">
    <button type="button" class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("agentDetail.backOverview")} onclick={() => shell.goOverview()}>
      <ArrowLeft class="size-4" />
    </button>
    <StatusDot {status} size={10} />
    <h1 class="min-w-0 truncate text-base font-bold">{agent.title}</h1>
    <span class="flex min-w-0 items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
      <GitBranch class="size-3" /><span class="truncate">{agent.branch}</span>
    </span>
    {#if sharedAgents.length > 1}
      <span class="rounded-full bg-accent-share/10 px-2 py-0.5 text-[10px] font-semibold text-accent-share">{t("agentDetail.sharedWorktree", { count: sharedAgents.length })}</span>
    {/if}
    <div class="ml-auto flex items-center gap-2.5">
      <Checkpoints {agent} />
      <Timeline {agent} />
      <PrPanel {agent} />
      <OpenExternal worktreePath={agent.worktreePath} />
      {#if group && group.members.length > 1}
        <button type="button" class="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[10.5px] font-semibold hover:bg-accent" onclick={() => shell.openCompare(group.groupId)}>
          <GitFork class="size-3" />{t("agentDetail.compare", { count: group.members.length })}
        </button>
      {/if}
      <span class="text-[10.5px] text-muted-foreground">{agent.lastActivity ?? t("common.waitingActivity")}</span>
      <StatusBadge {status} />
    </div>
  </header>

  {#if status === "blocked"}
    <div class="flex shrink-0 items-center gap-3 rounded-[11px] border border-status-blocked/30 bg-status-blocked/8 px-3.5 py-2.5">
      <TriangleAlert class="size-4 text-status-blocked" />
      <div class="min-w-0 flex-1">
        <p class="text-[12.5px] font-semibold text-status-blocked-fg">{t("agentDetail.blockedTitle")}</p>
        <p class="mt-0.5 text-[10.5px] text-muted-foreground">{t("agentDetail.blockedDesc")}</p>
      </div>
      <button type="button" class="rounded-full bg-status-blocked px-3 py-1.5 text-[10.5px] font-bold text-status-blocked-on" onclick={() => shell.showTerminal()}>{t("agentDetail.goTerminal")}</button>
    </div>
  {/if}

  <div class="flex shrink-0 items-end gap-1 border-b">
    {#each terminals as term (term.id)}
      <div
        class="flex items-center border-b-2 {activeTerminal?.id === term.id && showTerminal ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
      >
        <button
          type="button"
          class="flex items-center gap-1.5 py-1 pl-3 text-[11.5px] font-medium"
          onclick={() => shell.selectTab(term.id)}
        >
          <StatusDot status={sessionStatus.get(term.id) ?? "idle"} size={6} />
          {tabLabel(term)}
        </button>
        {#if terminals.length > 1}
          <button
            type="button"
            aria-label={t("agentDetail.closeTerminal")}
            class="mx-1 rounded p-1 hover:bg-muted"
            onclick={(event) => closeTerminal(term, event)}
          ><X class="size-3" /></button>
        {:else}
          <span class="pr-3"></span>
        {/if}
      </div>
    {/each}
    <div class="relative">
      <button
        type="button"
        aria-label={t("agentDetail.newTerminal")}
        title={t("agentDetail.newTerminal")}
        class="mb-0.5 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onclick={() => (pickerOpen = !pickerOpen)}
      >
        <Plus class="size-3.5" />
      </button>
      {#if pickerOpen}
        <button type="button" class="fixed inset-0 z-40 cursor-default" aria-hidden="true" tabindex="-1" onclick={() => (pickerOpen = false)}></button>
        <div class="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-lg border bg-card p-1 shadow-md">
          <p class="px-2 pb-1 pt-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t("agentDetail.newTerminal")}</p>
          {#each agentKindStore.selectableKindIds as k (k)}
            <button type="button" class="flex w-full items-center rounded px-2 py-1.5 text-left text-[11.5px] hover:bg-accent" onclick={() => addTerminal(k)}>{agentKindStore.labelOf(k)}</button>
          {/each}
        </div>
      {/if}
    </div>
    {#if shell.openFilePath}
      <div class="flex items-center border-b-2 {shell.showEditor ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}">
        <button type="button" class="max-w-44 truncate py-1 pl-3 text-[11.5px] font-medium" onclick={() => shell.openFile(shell.openFilePath!)}>{shell.openFilePath.split("/").at(-1)}</button>
        <button type="button" aria-label={t("agentDetail.closeFileTab")} class="mx-1 rounded p-1 hover:bg-muted" onclick={() => shell.closeFile()}><X class="size-3" /></button>
      </div>
    {/if}
    <button
      type="button"
      class="border-b-2 px-3 pb-2 pt-1 text-[11.5px] font-medium {shell.showPreview ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
      onclick={() => shell.showPreviewPane()}
    >{t("agentDetail.preview")}</button>
  </div>

  <div class="min-h-0 flex-1 overflow-hidden rounded-xl border {status === 'blocked' && showTerminal ? 'border-status-blocked/30 shadow-[0_0_20px_color-mix(in_oklch,var(--status-blocked)_8%,transparent)]' : ''}">
    {#if shell.showPreview}
      {#key agent.id}
        <Preview {agent} sessionId={activeTerminal?.id ?? agent.id} />
      {/key}
    {:else if shell.showEditor && shell.openFilePath}
      <FileViewer {agent} path={shell.openFilePath} sharedCount={sharedAgents.length} />
    {:else if activeTerminal}
      {#key activeTerminal.id}
        <div class="flex h-full flex-col bg-terminal p-1.5">
          <div class="min-h-0 flex-1"><Terminal sessionId={activeTerminal.id} cmd={activeTerminal.command} cwd={agent.worktreePath} initialPrompt={activeTerminal.position === 0 ? (agent.prompt ?? undefined) : undefined} /></div>
          <div class="shrink-0 px-2 py-1 font-mono text-[9.5px] text-white/35">{t("terminal.hint")}</div>
        </div>
      {/key}
    {/if}
  </div>
</section>
