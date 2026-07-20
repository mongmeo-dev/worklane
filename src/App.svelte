<script lang="ts">
  import type { Agent } from "$lib/types";
  import { mockProjects } from "$lib/data/mock";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";

  const projects = mockProjects;

  // 초기 선택: 첫 프로젝트의 첫 에이전트
  let selectedAgentId = $state(projects[0]?.agents[0]?.id ?? "");

  const selectedAgent = $derived<Agent | undefined>(
    projects.flatMap((p) => p.agents).find((a) => a.id === selectedAgentId),
  );

  function handleSelect(agent: Agent) {
    selectedAgentId = agent.id;
  }
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-sm">
  <TitleBar />
  <div class="flex min-h-0 flex-1">
    <Sidebar {projects} {selectedAgentId} onSelect={handleSelect} />
    <MainPanel agent={selectedAgent} />
  </div>
</div>
