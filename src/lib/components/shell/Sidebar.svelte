<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { agentKindLabels } from "$lib/data/labels";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import StatusDot from "./StatusDot.svelte";
  import Folder from "@lucide/svelte/icons/folder";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash from "@lucide/svelte/icons/trash-2";
  import ProjectDialog from "./ProjectDialog.svelte";
  import AgentDialog from "./AgentDialog.svelte";
  import DeleteAgentDialog from "./DeleteAgentDialog.svelte";

  interface Props {
    projects: Project[];
    selectedAgentId: string;
    onSelect: (agent: Agent) => void;
  }

  let { projects, selectedAgentId, onSelect }: Props = $props();

  let projectDialogOpen = $state(false);
  let agentDialogFor = $state<Project | null>(null);
  let agentDialogOpen = $state(false);
  let deleteAgentTarget = $state<Agent | null>(null);
  let deleteDialogOpen = $state(false);

  function openAgentDialog(p: Project) {
    agentDialogFor = p;
    agentDialogOpen = true;
  }
  // 다이얼로그가 닫히면 대상 프로젝트도 정리
  $effect(() => {
    if (!agentDialogOpen) agentDialogFor = null;
  });

  async function requestDeleteAgent(agent: Agent) {
    // "묻지 않기"가 설정돼 있으면 팝업 없이 안전 제거(force=false)
    if (uiSettings.skipWorktreeDeletePrompt) {
      await projectStore.removeAgent(agent.id, agent.worktreeManaged, false);
      return;
    }
    deleteAgentTarget = agent;
    deleteDialogOpen = true;
  }

  $effect(() => {
    if (!deleteDialogOpen) deleteAgentTarget = null;
  });
</script>

<aside class="flex h-full w-full flex-col border-r bg-sidebar">
  <div class="flex h-9 items-center px-3">
    <span class="text-xs font-medium text-muted-foreground">프로젝트 & 에이전트</span>
    <Button variant="ghost" size="icon" class="ml-auto size-6" onclick={() => (projectDialogOpen = true)}>
      <Plus class="size-3.5" />
    </Button>
  </div>

  <ScrollArea class="flex-1">
    <div class="flex flex-col gap-4 px-2 pb-4">
      {#each projects as project (project.id)}
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5 px-2 py-1">
            <Folder class="size-3.5 text-muted-foreground" />
            <span class="truncate text-xs font-semibold">{project.name}</span>
            <button type="button" class="ml-auto rounded p-0.5 hover:bg-sidebar-accent"
              onclick={() => openAgentDialog(project)}>
              <Plus class="size-3 text-muted-foreground" />
            </button>
            <span class="text-[10px] text-muted-foreground">{project.agents.length}</span>
          </div>

          {#each project.agents as agent (agent.id)}
            <div class="group relative flex items-center">
              <button
                type="button"
                onclick={() => onSelect(agent)}
                class="flex w-full flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent
                  {agent.id === selectedAgentId ? 'bg-sidebar-accent' : ''}"
              >
                <div class="flex w-full items-center gap-2">
                  <StatusDot status={sessionStatus.get(agent.id) ?? agent.status ?? "idle"} />
                  <span class="truncate text-sm">{agent.title}</span>
                </div>
                <div class="flex w-full items-center gap-2 pl-3.5">
                  <span class="truncate text-[11px] text-muted-foreground">
                    {agentKindLabels[agent.kind]}
                  </span>
                  <span class="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {agent.lastActivity}
                  </span>
                </div>
              </button>
              <button
                type="button"
                class="absolute right-1 hidden rounded p-1 group-hover:block hover:bg-destructive/10"
                onclick={() => requestDeleteAgent(agent)}
              >
                <Trash class="size-3 text-muted-foreground" />
              </button>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </ScrollArea>
</aside>

<ProjectDialog bind:open={projectDialogOpen} />
{#if agentDialogFor}
  <AgentDialog bind:open={agentDialogOpen} project={agentDialogFor} />
{/if}
{#if deleteAgentTarget}
  <DeleteAgentDialog bind:open={deleteDialogOpen} agent={deleteAgentTarget} />
{/if}
