<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";
  import SettingsDialog from "$lib/components/shell/SettingsDialog.svelte";
  import AgentDialog from "$lib/components/shell/AgentDialog.svelte";
  import StatusBar from "$lib/components/shell/StatusBar.svelte";

  const STORAGE_KEY = "shell:sidebar-size";

  let newAgentOpen = $state(false);

  const selectedAgent = $derived<Agent | undefined>(
    projectStore.projects.flatMap((p) => p.agents).find((a) => a.id === shell.selectedAgentId),
  );
  const newAgentProject = $derived(
    projectStore.projects.find((project) => project.id === selectedAgent?.projectId) ?? projectStore.projects[0],
  );

  // localStorage에서 사이드바 비율 복원. 손상값(빈 문자열/NaN)은 기본값 22로 폴백하고
  // paneforge의 min/max(15~40) 범위로 clamp한다.
  function loadSidebarSize(): number {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    const size = Number.isFinite(raw) && raw > 0 ? raw : 22;
    return Math.min(40, Math.max(15, size));
  }
  const initialSize = loadSidebarSize();

  function persistSize(size: number) {
    localStorage.setItem(STORAGE_KEY, String(size));
  }

  onMount(() => {
    sessionStatus.start();
    projectStore.load();
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-sm">
  <TitleBar projects={projectStore.projects} showRightToggle={Boolean(selectedAgent)} onNewAgent={() => (newAgentOpen = true)} />
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="horizontal" class="h-full w-full">
      {#if shell.leftPanelOpen}
        <Resizable.Pane
          class="flex"
          defaultSize={initialSize}
          minSize={15}
          maxSize={40}
          onResize={persistSize}
        >
          <Sidebar projects={projectStore.projects} />
        </Resizable.Pane>
        <Resizable.Handle withHandle />
      {/if}
      <Resizable.Pane class="flex">
        <MainPanel agent={selectedAgent} projects={projectStore.projects} />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>
  <StatusBar />

  <SettingsDialog />
  {#if newAgentProject}
    <AgentDialog bind:open={newAgentOpen} project={newAgentProject} />
  {/if}
</div>
