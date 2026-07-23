<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import OverviewGrid from "./OverviewGrid.svelte";
  import AgentDetail from "./AgentDetail.svelte";

  let { agent, projects }: { agent: Agent | undefined; projects: Project[] } = $props();
</script>

<main class="flex min-h-0 min-w-0 flex-1 bg-background">
  {#if agent}
    <AgentDetail {agent} {projects} />
  {:else}
    <OverviewGrid {projects} />
  {/if}
</main>
