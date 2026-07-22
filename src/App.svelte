<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";
  import SettingsDialog from "$lib/components/shell/SettingsDialog.svelte";

  const STORAGE_KEY = "shell:sidebar-size";

  let selectedAgentId = $state("");

  const selectedAgent = $derived<Agent | undefined>(
    projectStore.projects.flatMap((p) => p.agents).find((a) => a.id === selectedAgentId),
  );

  function handleSelect(agent: Agent) {
    selectedAgentId = agent.id;
  }

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
  <TitleBar />
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="horizontal" class="h-full w-full">
      <Resizable.Pane
        class="flex"
        defaultSize={initialSize}
        minSize={15}
        maxSize={40}
        onResize={persistSize}
      >
        <Sidebar projects={projectStore.projects} {selectedAgentId} onSelect={handleSelect} />
      </Resizable.Pane>
      <Resizable.Handle withHandle />
      <Resizable.Pane class="flex">
        <MainPanel agent={selectedAgent} />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>

  <SettingsDialog />
</div>
