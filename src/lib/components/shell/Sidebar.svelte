<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { agentKindLabels } from "$lib/data/labels";
  import { hasDefaultWorkspace, worktreeGroups } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import StatusDot from "./StatusDot.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import { agentRowClasses, projectPathLabel } from "./sidebarModel";
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

  function openAgentDialog(project: Project) {
    agentDialogFor = project;
    agentDialogOpen = true;
  }

  async function requestDeleteAgent(agent: Agent) {
    if (uiSettings.skipWorktreeDeletePrompt) {
      try {
        await projectStore.removeAgent(agent.id, agent.worktreeManaged, false);
        return;
      } catch {
        // 안전 제거 실패는 확인 다이얼로그로 전환한다.
      }
    }
    deleteAgentTarget = agent;
    deleteDialogOpen = true;
  }

  $effect(() => { if (!agentDialogOpen) agentDialogFor = null; });
  $effect(() => { if (!defaultWorkspaceDialogOpen) defaultWorkspaceFor = null; });
  $effect(() => { if (!deleteDialogOpen) deleteAgentTarget = null; });
  $effect(() => { if (!deleteProjectDialogOpen) deleteProjectTarget = null; });
</script>

<aside class="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
  <div class="flex h-9 shrink-0 items-center px-3">
    <span class="text-[11px] font-semibold text-muted-foreground">프로젝트 & 에이전트</span>
    <Button variant="ghost" size="icon" class="ml-auto size-6" aria-label="프로젝트 추가" onclick={() => (projectDialogOpen = true)}>
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
        전체 오버뷰
      </button>

      {#each projects as project (project.id)}
        <section class="rounded-xl border border-sidebar-border bg-card/80 p-1.5">
          <div class="flex items-center gap-1.5 px-1.5 py-1.5">
            <Folder class="size-3.5 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-[12.5px] font-semibold">{project.name}</h2>
              <p class="truncate font-mono text-[9.5px] text-muted-foreground/70">{projectPathLabel(project.path)}</p>
            </div>
            <button type="button" class="rounded-md p-1 hover:bg-sidebar-accent" aria-label={`${project.name}에 에이전트 추가`} onclick={() => openAgentDialog(project)}>
              <Plus class="size-3.5 text-muted-foreground" />
            </button>
            <button type="button" class="rounded-md p-1 hover:bg-destructive/10" aria-label={`${project.name} 삭제`} onclick={() => { deleteProjectTarget = project; deleteProjectDialogOpen = true; }}>
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
              기본 작업환경 다시 만들기
            </button>
          {/if}
          <div class="mt-1 flex flex-col gap-1">
            {#each worktreeGroups(project) as group (group.key)}
              <div class={group.shared ? "rounded-[10px] bg-background/45 p-1" : ""}>
                {#if group.shared}
                  <div class="flex items-center gap-1.5 px-2 py-1 font-mono text-[9.5px] text-muted-foreground">
                    <GitBranch class="size-3" />
                    <span class="min-w-0 flex-1 truncate">{group.branch}</span>
                    <span class="rounded-full bg-accent-share/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-share">공유 · {group.agents.length} 에이전트</span>
                  </div>
                {/if}
                <div class="flex flex-col gap-1">
                  {#each group.agents as agent (agent.id)}
                    {@const status = agent.status ?? "idle"}
                    <div class="group relative">
                      <button type="button" class={agentRowClasses(status, shell.selectedAgentId === agent.id)} onclick={() => shell.selectAgent(agent.id)}>
                        <span class="flex w-full items-center gap-2">
                          <StatusDot {status} />
                          <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{agent.title}</span>
                          <StatusBadge {status} />
                        </span>
                        <span class="mt-1 flex w-full items-center gap-1.5 pl-4 text-[10.5px] text-muted-foreground">
                          <span>{agentKindLabels[agent.kind]}</span>
                          {#if !group.shared}<span>·</span><span class="min-w-0 truncate font-mono">{agent.branch}</span>{/if}
                          <span class="ml-auto shrink-0 pr-1">{agent.lastActivity ?? "대기 중"}</span>
                        </span>
                      </button>
                      <button type="button" class="absolute right-1 top-7 hidden rounded p-1 group-hover:block hover:bg-destructive/10" aria-label={`${agent.title} 삭제`} onclick={() => requestDeleteAgent(agent)}>
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
          <p class="text-xs text-muted-foreground">아직 프로젝트가 없습니다.</p>
          <button type="button" class="mt-2 text-xs font-medium text-accent-share" onclick={() => (projectDialogOpen = true)}>프로젝트 추가</button>
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
