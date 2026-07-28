<script lang="ts">
  import type { Agent, AgentStatus, Project } from "$lib/types";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { allAgents, hasDefaultWorkspace, projectRollup, worktreeGroups } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { sidebarUi } from "$lib/stores/sidebarUi.svelte";
  import { projectDialogUi } from "$lib/stores/projectDialogUi.svelte";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import StatusDot from "./StatusDot.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import { agentRowClasses, filterProjects, projectPathLabel } from "./sidebarModel";
  import { t } from "$lib/i18n";
  import Folder from "@lucide/svelte/icons/folder";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash from "@lucide/svelte/icons/trash-2";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import House from "@lucide/svelte/icons/house";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import AgentDialog from "./AgentDialog.svelte";
  import DefaultWorkspaceDialog from "./DefaultWorkspaceDialog.svelte";
  import DeleteAgentDialog from "./DeleteAgentDialog.svelte";
  import DeleteProjectDialog from "./DeleteProjectDialog.svelte";
  import { createContextMenuTrigger } from "$lib/context-menu/trigger";
  import { projectContextActions, workspaceContextActions } from "./sidebarContextActions";
  import RenameAgentDialog from "./RenameAgentDialog.svelte";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";

  let { projects }: { projects: Project[] } = $props();

  let agentDialogFor = $state<Project | null>(null);
  let agentDialogOpen = $state(false);
  let defaultWorkspaceFor = $state<Project | null>(null);
  let defaultWorkspaceDialogOpen = $state(false);
  let deleteAgentTarget = $state<Agent | null>(null);
  let deleteDialogOpen = $state(false);
  let deleteProjectTarget = $state<Project | null>(null);
  let deleteProjectDialogOpen = $state(false);
  let renameAgentTarget = $state<Agent | null>(null);
  let renameAgentDialogOpen = $state(false);

  const shownProjects = $derived(filterProjects(projects, sidebarUi.query));
  // ⌘1~⌘9 점프 번호는 거르기와 무관하게 원본 순서를 따른다.
  const jumpIndexById = $derived(new Map(allAgents(projects).slice(0, 9).map((agent, i) => [agent.id, i + 1])));
  // 거른 프로젝트는 agents가 잘려 있으므로 "기본 작업환경" 판정은 원본으로 한다.
  const originalById = $derived(new Map(projects.map((project) => [project.id, project])));

  // 롤업에 표시할 상태 순서. 0건인 상태는 감춰 시선을 아끼고, 주의 필요를 앞세운다.
  const ROLLUP_ORDER: AgentStatus[] = ["failed", "blocked", "running", "done", "idle"];

  function openAgentDialog(project: Project) {
    agentDialogFor = project;
    agentDialogOpen = true;
  }

  async function requestDeleteAgent(agent: Agent) {
    if (uiSettings.skipWorktreeDeletePrompt) {
      try {
        await projectStore.removeAgent(agent.id, agent.worktreeManaged, false);
        return;
      } catch (reason) {
        if (reason === "WORKTREE_DIRTY") {
          deleteAgentTarget = agent;
          deleteDialogOpen = true;
        } else {
          actionErrors.report(reason);
        }
        return;
      }
    }
    deleteAgentTarget = agent;
    deleteDialogOpen = true;
  }

  $effect(() => { if (!agentDialogOpen) agentDialogFor = null; });
  $effect(() => { if (!defaultWorkspaceDialogOpen) defaultWorkspaceFor = null; });
  $effect(() => { if (!deleteDialogOpen) deleteAgentTarget = null; });
  $effect(() => { if (!deleteProjectDialogOpen) deleteProjectTarget = null; });
  $effect(() => { if (!renameAgentDialogOpen) renameAgentTarget = null; });
</script>

<aside class="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
  <div class="flex h-9 shrink-0 items-center px-3">
    <span class="text-xs font-semibold text-muted-foreground">{t("sidebar.heading")}</span>
    <Button variant="ghost" size="icon" class="ml-auto size-7" aria-label={t("sidebar.addProject")} onclick={() => projectDialogUi.open()}>
      <Plus class="size-3.5" />
    </Button>
  </div>

  {#if projects.length > 0}
    <div class="shrink-0 px-2 pb-2">
      <div class="flex h-7 items-center gap-1.5 rounded-lg border border-sidebar-border bg-background/50 px-2 focus-within:border-focus-ring">
        <Search class="size-3.5 shrink-0 text-muted-foreground" />
        <input
          bind:value={sidebarUi.query}
          class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          placeholder={t("sidebar.filterPlaceholder")}
          aria-label={t("sidebar.filterAria")}
          spellcheck="false"
        />
        {#if sidebarUi.query !== ""}
          <button
            type="button"
            class="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label={t("sidebar.clearFilter")}
            onclick={() => sidebarUi.clearQuery()}
          ><X class="size-3" /></button>
        {/if}
      </div>
    </div>
  {/if}

  <ScrollArea class="min-h-0 flex-1">
    <div class="flex flex-col gap-3 px-2 pb-4">
      <button
        type="button"
        class="flex h-10 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-sm font-semibold transition-colors {shell.selectedAgentId === null ? 'bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring' : 'hover:bg-sidebar-accent/70'}"
        onclick={() => shell.goOverview()}
      >
        <LayoutGrid class="size-3.5 text-muted-foreground" />
        {t("sidebar.overview")}
        <kbd class="ml-auto font-mono text-2xs font-medium text-muted-foreground">⌘0</kbd>
      </button>

      {#each shownProjects as project (project.id)}
        {@const rollup = projectRollup(project)}
        {@const collapsed = sidebarUi.isCollapsed(project.id)}
        {@const original = originalById.get(project.id) ?? project}
        {@const projectContextMenuTrigger = createContextMenuTrigger(() => projectContextActions({
          project,
          onAddWorkspace: () => openAgentDialog(original),
          onDelete: () => {
            deleteProjectTarget = original;
            deleteProjectDialogOpen = true;
          },
        }))}
        <section class="rounded-xl border border-sidebar-border bg-card/80 p-1.5">
          <div class="flex items-center gap-1 px-0.5 py-1">
            <button
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              aria-label={collapsed ? t("sidebar.expandProject", { project: project.name }) : t("sidebar.collapseProject", { project: project.name })}
              aria-expanded={!collapsed}
              onclick={() => sidebarUi.toggleProject(project.id)}
            >
              <ChevronRight class="size-3.5 transition-transform {collapsed ? '' : 'rotate-90'}" />
            </button>
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left"
              aria-label={project.name}
              oncontextmenu={projectContextMenuTrigger.oncontextmenu}
              onkeydown={projectContextMenuTrigger.onkeydown}
            >
              <Folder class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold">{project.name}</span>
                <span class="block truncate font-mono text-2xs text-muted-foreground">{projectPathLabel(project.path)}</span>
              </span>
            </button>
            <button type="button" class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground" aria-label={t("sidebar.addAgentTo", { project: project.name })} onclick={() => openAgentDialog(original)}>
              <Plus class="size-3.5" />
            </button>
            <button type="button" class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={t("sidebar.deleteProject", { project: project.name })} onclick={() => { deleteProjectTarget = original; deleteProjectDialogOpen = true; }}>
              <Trash class="size-3" />
            </button>
          </div>

          <!-- 프로젝트 단위 상태 롤업: 접힌 상태에서도 무슨 일이 벌어지는지 보이게 한다. -->
          {#if rollup.total > 0}
            <div
              class="flex items-center gap-2.5 px-1.5 pb-1.5 pt-0.5"
              aria-label={rollup.attention > 0
                ? t("sidebar.rollup", { total: rollup.total, attention: rollup.attention })
                : t("sidebar.rollupClean", { total: rollup.total })}
            >
              {#each ROLLUP_ORDER as status (status)}
                {#if rollup[status] > 0}
                  <span class="flex items-center gap-1 font-mono text-2xs tabular-nums {status === 'failed' ? 'text-destructive' : status === 'blocked' ? 'text-status-blocked-fg' : status === 'running' ? 'text-status-running-fg' : status === 'done' ? 'text-status-done-fg' : 'text-muted-foreground'}">
                    <StatusDot {status} size={6} />
                    {rollup[status]}
                  </span>
                {/if}
              {/each}
            </div>
          {/if}

          {#if !collapsed}
            {#if !hasDefaultWorkspace(original)}
              <button
                type="button"
                class="mt-1 flex w-full items-center gap-1.5 rounded-[10px] border border-dashed border-sidebar-border px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
                onclick={() => { defaultWorkspaceFor = original; defaultWorkspaceDialogOpen = true; }}
              >
                <House class="size-3 shrink-0" />
                {t("sidebar.recreateDefault")}
              </button>
            {/if}
            <div class="mt-1 flex flex-col gap-1">
              {#each worktreeGroups(project) as group (group.key)}
                <div class={group.shared ? "rounded-[10px] bg-background/45 p-1" : ""}>
                  {#if group.shared}
                    <div class="flex items-center gap-1.5 px-2 py-1 font-mono text-2xs text-muted-foreground">
                      <GitBranch class="size-3" />
                      <span class="min-w-0 flex-1 truncate">{group.branch}</span>
                      <span class="rounded-full bg-accent-share/10 px-1.5 py-0.5 text-2xs font-semibold text-accent-share">{t("sidebar.shared", { count: group.agents.length })}</span>
                    </div>
                  {/if}
                  <div class="flex flex-col gap-1">
                    {#each group.agents as agent (agent.id)}
                      {@const status = agent.status ?? "idle"}
                      {@const jumpIndex = jumpIndexById.get(agent.id)}
                      {@const workspaceContextMenuTrigger = createContextMenuTrigger(() => workspaceContextActions({
                        agent,
                        onSelect: () => shell.selectAgent(agent.id),
                        onRename: () => {
                          renameAgentTarget = agent;
                          renameAgentDialogOpen = true;
                        },
                        onDelete: () => void requestDeleteAgent(agent),
                      }))}
                      <div class="group relative">
                        <button type="button" class={agentRowClasses(status, shell.selectedAgentId === agent.id)} onclick={() => shell.selectAgent(agent.id)} oncontextmenu={workspaceContextMenuTrigger.oncontextmenu} onkeydown={workspaceContextMenuTrigger.onkeydown}>
                          <span class="flex w-full items-center gap-2">
                            <StatusDot {status} />
                            <span class="min-w-0 flex-1 truncate text-sm font-medium">{agent.title}</span>
                            {#if jumpIndex}
                              <kbd class="shrink-0 font-mono text-2xs font-medium text-muted-foreground" title={t("sidebar.jumpHint", { index: jumpIndex })}>⌘{jumpIndex}</kbd>
                            {/if}
                            <StatusBadge {status} />
                          </span>
                          <span class="mt-1 flex w-full items-center gap-1.5 pl-4 text-2xs text-muted-foreground">
                            <span>{agentKindStore.labelOf(agent.kind)}</span>
                            {#if !group.shared}<span aria-hidden="true">·</span><span class="min-w-0 truncate font-mono">{agent.branch}</span>{/if}
                            <span class="ml-auto shrink-0 pr-1">{agent.lastActivity ?? t("common.waitingActivity")}</span>
                          </span>
                        </button>
                        <!-- 삭제는 항상 DOM에 두어 키보드 탐색으로 도달할 수 있게 하고,
                             시각적으로만 호버·포커스 시 드러낸다(예전 hidden 방식은 키보드 접근 불가). -->
                        <button
                          type="button"
                          class="absolute right-1 top-7 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={t("sidebar.deleteAgent", { agent: agent.title })}
                          onclick={() => requestDeleteAgent(agent)}
                        >
                          <Trash class="size-3" />
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {:else}
        <div class="rounded-xl border border-dashed border-sidebar-border p-5 text-center">
          {#if sidebarUi.query.trim() !== ""}
            <p class="text-xs text-muted-foreground">{t("sidebar.noMatches", { query: sidebarUi.query.trim() })}</p>
            <button type="button" class="mt-2 text-xs font-medium text-accent-share hover:underline" onclick={() => sidebarUi.clearQuery()}>{t("sidebar.clearFilter")}</button>
          {:else}
            <p class="text-xs text-muted-foreground">{t("sidebar.empty")}</p>
            <button type="button" class="mt-2 text-xs font-medium text-accent-share hover:underline" onclick={() => projectDialogUi.open()}>{t("sidebar.addProject")}</button>
          {/if}
        </div>
      {/each}
    </div>
  </ScrollArea>
</aside>

{#if agentDialogFor}<AgentDialog bind:open={agentDialogOpen} project={agentDialogFor} />{/if}
{#if defaultWorkspaceFor}<DefaultWorkspaceDialog bind:open={defaultWorkspaceDialogOpen} project={defaultWorkspaceFor} />{/if}
{#if deleteAgentTarget}<DeleteAgentDialog bind:open={deleteDialogOpen} agent={deleteAgentTarget} />{/if}
{#if deleteProjectTarget}<DeleteProjectDialog bind:open={deleteProjectDialogOpen} project={deleteProjectTarget} />{/if}
{#if renameAgentTarget}<RenameAgentDialog bind:open={renameAgentDialogOpen} agent={renameAgentTarget} />{/if}
