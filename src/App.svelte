<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import { mockProjects } from "$lib/data/mock";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";

  const projects = mockProjects;
  const STORAGE_KEY = "shell:sidebar-size";

  // 초기 선택: 첫 프로젝트의 첫 에이전트
  let selectedAgentId = $state(projects[0]?.agents[0]?.id ?? "");

  const selectedAgent = $derived<Agent | undefined>(
    projects.flatMap((p) => p.agents).find((a) => a.id === selectedAgentId),
  );

  function handleSelect(agent: Agent) {
    selectedAgentId = agent.id;
  }

  // localStorage에서 사이드바 비율 복원 (기본 22%)
  const initialSize = Number(localStorage.getItem(STORAGE_KEY) ?? "22");

  function persistSize(size: number) {
    localStorage.setItem(STORAGE_KEY, String(size));
  }

  onMount(() => {
    sessionStatus.start();
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-sm">
  <TitleBar />
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="horizontal" class="h-full w-full">
      <Resizable.Pane
        defaultSize={initialSize}
        minSize={15}
        maxSize={40}
        onResize={persistSize}
      >
        <Sidebar {projects} {selectedAgentId} onSelect={handleSelect} />
      </Resizable.Pane>
      <Resizable.Handle withHandle />
      <Resizable.Pane>
        <MainPanel agent={selectedAgent} />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>
</div>
