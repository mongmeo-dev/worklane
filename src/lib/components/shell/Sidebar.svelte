<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { agentKindLabels } from "$lib/data/mock";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import StatusDot from "./StatusDot.svelte";
  import Folder from "@lucide/svelte/icons/folder";

  interface Props {
    projects: Project[];
    selectedAgentId: string;
    onSelect: (agent: Agent) => void;
  }

  let { projects, selectedAgentId, onSelect }: Props = $props();
</script>

<aside class="flex w-72 shrink-0 flex-col border-r bg-sidebar">
  <div class="flex h-9 items-center px-3">
    <span class="text-xs font-medium text-muted-foreground">프로젝트 & 에이전트</span>
  </div>

  <ScrollArea class="flex-1">
    <div class="flex flex-col gap-4 px-2 pb-4">
      {#each projects as project (project.id)}
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5 px-2 py-1">
            <Folder class="size-3.5 text-muted-foreground" />
            <span class="truncate text-xs font-semibold">{project.name}</span>
            <span class="ml-auto text-[10px] text-muted-foreground">
              {project.agents.length}
            </span>
          </div>

          {#each project.agents as agent (agent.id)}
            <button
              type="button"
              onclick={() => onSelect(agent)}
              class="flex flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent
                {agent.id === selectedAgentId ? 'bg-sidebar-accent' : ''}"
            >
              <div class="flex w-full items-center gap-2">
                <StatusDot status={sessionStatus.get(agent.id) ?? agent.status} />
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
          {/each}
        </div>
      {/each}
    </div>
  </ScrollArea>
</aside>
