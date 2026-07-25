<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { hasDefaultWorkspace, worktreeGroups } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import StatusDot from "./StatusDot.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import { agentRowClasses, projectPathLabel } from "./sidebarModel";
  import { t } from "$lib/i18n";
  import Folder from "@lucide/svelte/icons/folder";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash from "@lucide/svelte/icons/trash-2";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import House from "@lucide/svelte/icons/house";
  import ProjectDialog from "./ProjectDialog.svelte";
  import AgentDialog from "./AgentDialog.svelte";
  import DefaultWorkspaceDialog from "./DefaultWorkspaceDialog.svelte";
  import DeleteAgentDialog from "./DeleteAgentDialog.svelte";
  import DeleteProjectDialog from "./DeleteProjectDialog.svelte";
  import { createContextMenuTrigger } from "$lib/context-menu/trigger";
  import { projectContextActions, workspaceContextActions } from "./sidebarContextActions";
  import RenameAgentDialog from "./RenameAgentDialog.svelte";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";

  let { projects }: { projects: Project[] } = $props();

  let projectDialogOpen = $state(false);
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
    <span class="text-[11px] font-semibold text-muted-foreground">{t("sidebar.heading")}</span>
    <Button variant="ghost" size="icon" class="ml-auto size-6" aria-label={t("sidebar.addProject")} onclick={() => (projectDialogOpen = true)}>
      <Plus class="size-3.5" />
    </Button>
  </div>

  <ScrollArea class="min-h-0 flex-1">
    <div class="flex flex-col gap-3 px-2 pb-4">
      <button
        type="button"
        class="flex h-10 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[12.5px] font-semibold transition-colors {shell.selectedAgentId === null ? 'bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring' : 'hover:bg-sidebar-accent/70'}"
        onclick={() => shell.goOverview()}
      >
        <LayoutGrid class="size-3.5 text-muted-foreground" />
        {t("sidebar.overview")}
      </button>

      {#each projects as project (project.id)}
        {@const projectContextMenuTrigger = createContextMenuTrigger(() => projectContextActions({
          project,
          onAddWorkspace: () => openAgentDialog(project),
          onDelete: () => {
            deleteProjectTarget = project;
            deleteProjectDialogOpen = true;
          },
        }))}
        <section class="rounded-xl border border-sidebar-border bg-card/80 p-1.5">
          <div class="flex items-center gap-1.5 px-1.5 py-1.5">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left"
              aria-label={project.name}
              oncontextmenu={projectContextMenuTrigger.oncontextmenu}
              onkeydown={projectContextMenuTrigger.onkeydown}
            >
              <Folder class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12.5px] font-semibold">{project.name}</span>
                <span class="block truncate font-mono text-[9.5px] text-muted-foreground/70">{projectPathLabel(project.path)}</span>
              </span>
            </button>
            <button type="button" class="rounded-md p-1 hover:bg-sidebar-accent" aria-label={t("sidebar.addAgentTo", { project: project.name })} onclick={() => openAgentDialog(project)}>
              <Plus class="size-3.5 text-muted-foreground" />
            </button>
            <button type="button" class="rounded-md p-1 hover:bg-destructive/10" aria-label={t("sidebar.deleteProject", { project: project.name })} onclick={() => { deleteProjectTarget = project; deleteProjectDialogOpen = true; }}>
              <Trash class="size-3 text-muted-foreground" />
            </button>
          </div>

          {#if !hasDefaultWorkspace(project)}
            <button
              type="button"
              class="mt-1 flex w-full items-center gap-1.5 rounded-[10px] border border-dashed border-sidebar-border px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70"
              onclick={() => { defaultWorkspaceFor = project; defaultWorkspaceDialogOpen = true; }}
            >
              <House class="size-3 shrink-0" />
              {t("sidebar.recreateDefault")}
            </button>
          {/if}
          <div class="mt-1 flex flex-col gap-1">
            {#each worktreeGroups(project) as group (group.key)}
              <div class={group.shared ? "rounded-[10px] bg-background/45 p-1" : ""}>
                {#if group.shared}
                  <div class="flex items-center gap-1.5 px-2 py-1 font-mono text-[9.5px] text-muted-foreground">
                    <GitBranch class="size-3" />
                    <span class="min-w-0 flex-1 truncate">{group.branch}</span>
                    <span class="rounded-full bg-accent-share/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-share">{t("sidebar.shared", { count: group.agents.length })}</span>
                  </div>
                {/if}
                <div class="flex flex-col gap-1">
                  {#each group.agents as agent (agent.id)}
                    {@const status = agent.status ?? "idle"}
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
                          <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{agent.title}</span>
                          <StatusBadge {status} />
                        </span>
                        <span class="mt-1 flex w-full items-center gap-1.5 pl-4 text-[10.5px] text-muted-foreground">
                          <span>{agentKindStore.labelOf(agent.kind)}</span>
                          {#if !group.shared}<span>·</span><span class="min-w-0 truncate font-mono">{agent.branch}</span>{/if}
                          <span class="ml-auto shrink-0 pr-1">{agent.lastActivity ?? t("common.waitingActivity")}</span>
                        </span>
                      </button>
                      <button type="button" class="absolute right-1 top-7 hidden rounded p-1 group-hover:block group-focus-within:block hover:bg-destructive/10" aria-label={t("sidebar.deleteAgent", { agent: agent.title })} onclick={() => requestDeleteAgent(agent)}>
                        <Trash class="size-3 text-muted-foreground" />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <div class="rounded-xl border border-dashed border-sidebar-border p-5 text-center">
          <p class="text-xs text-muted-foreground">{t("sidebar.empty")}</p>
          <button type="button" class="mt-2 text-xs font-medium text-accent-share" onclick={() => (projectDialogOpen = true)}>{t("sidebar.addProject")}</button>
        </div>
      {/each}
    </div>
  </ScrollArea>
</aside>

<ProjectDialog bind:open={projectDialogOpen} />
{#if agentDialogFor}<AgentDialog bind:open={agentDialogOpen} project={agentDialogFor} />{/if}
{#if defaultWorkspaceFor}<DefaultWorkspaceDialog bind:open={defaultWorkspaceDialogOpen} project={defaultWorkspaceFor} />{/if}
{#if deleteAgentTarget}<DeleteAgentDialog bind:open={deleteDialogOpen} agent={deleteAgentTarget} />{/if}
{#if deleteProjectTarget}<DeleteProjectDialog bind:open={deleteProjectDialogOpen} project={deleteProjectTarget} />{/if}
{#if renameAgentTarget}<RenameAgentDialog bind:open={renameAgentDialogOpen} agent={renameAgentTarget} />{/if}
