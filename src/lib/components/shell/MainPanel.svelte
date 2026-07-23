<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import OverviewGrid from "./OverviewGrid.svelte";
  import AgentDetail from "./AgentDetail.svelte";
  import FilePanel from "./FilePanel.svelte";
  import { agentsForWorktree } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";

  let { agent, projects }: { agent: Agent | undefined; projects: Project[] } = $props();
</script>

<main class="flex min-h-0 min-w-0 flex-1 bg-background">
  {#if agent}
    <AgentDetail {agent} {projects} />
    {#if shell.rightPanelOpen}
      <FilePanel {agent} sharedCount={agentsForWorktree(projects, agent).length} />
    {/if}
  {:else}
    <OverviewGrid {projects} />
  {/if}
</main>
