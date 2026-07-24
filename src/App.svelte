<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { attentionNotifier } from "$lib/attention/notifier";
  import { promptStore } from "$lib/stores/prompts.svelte";
  import { taskStore } from "$lib/stores/tasks.svelte";
  import { playbookStore } from "$lib/stores/playbooks.svelte";
  import { composer } from "$lib/stores/composer.svelte";
  import { autoCheckpoint } from "$lib/stores/autoCheckpoint.svelte";
  import { eventRecorder } from "$lib/stores/eventRecorder";
  import { updater } from "$lib/stores/updater.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";
  import SettingsDialog from "$lib/components/shell/SettingsDialog.svelte";
  import AgentDialog from "$lib/components/shell/AgentDialog.svelte";
  import FanoutDialog from "$lib/components/shell/FanoutDialog.svelte";
  import CompareDialog from "$lib/components/shell/CompareDialog.svelte";
  import TaskBoard from "$lib/components/shell/TaskBoard.svelte";
  import CommandPalette from "$lib/components/shell/CommandPalette.svelte";
  import UpdateBanner from "$lib/components/shell/UpdateBanner.svelte";
  import StatusBar from "$lib/components/shell/StatusBar.svelte";

  const STORAGE_KEY = "shell:sidebar-size";

  let newAgentOpen = $state(false);
  let taskBoardOpen = $state(false);

  const selectedAgent = $derived<Agent | undefined>(
    projectStore.projects.flatMap((p) => p.agents).find((a) => a.id === shell.selectedAgentId),
  );
  const newAgentProject = $derived(
    projectStore.projects.find((project) => project.id === selectedAgent?.projectId) ?? projectStore.projects[0],
  );
  const fanoutProject = $derived(
    (composer.seed?.projectId
      ? projectStore.projects.find((project) => project.id === composer.seed?.projectId)
      : undefined) ?? newAgentProject,
  );

  // localStorage에서 사이드바 비율 복원. 손상값(빈 문자열/NaN)은 기본값 22로 폴백하고
  // paneforge의 min/max(10~40) 범위로 clamp한다.
  function loadSidebarSize(): number {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    const size = Number.isFinite(raw) && raw > 0 ? raw : 22;
    return Math.min(40, Math.max(10, size));
  }
  const initialSize = loadSidebarSize();

  function persistSize(size: number) {
    localStorage.setItem(STORAGE_KEY, String(size));
  }

  onMount(() => {
    sessionStatus.start();
    projectStore.load();
    promptStore.load();
    taskStore.load();
    playbookStore.load();
    attentionNotifier.start((agentId) => {
      for (const project of projectStore.projects) {
        const agent = project.agents.find((a) => a.id === agentId);
        if (agent) return { agentTitle: agent.title, projectName: project.name };
      }
      return undefined;
    });
    autoCheckpoint.start((agentId) => {
      for (const project of projectStore.projects) {
        const agent = project.agents.find((a) => a.id === agentId);
        if (agent) return { agentId: agent.id, worktreePath: agent.worktreePath };
      }
      return undefined;
    });
    eventRecorder.start();
    updater.start();

    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        shell.togglePalette();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      updater.stop();
    };
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-sm">
  <TitleBar projects={projectStore.projects} showRightToggle={Boolean(selectedAgent)} onNewAgent={() => (newAgentOpen = true)} onFanout={() => composer.openFanout()} onTasks={() => (taskBoardOpen = true)} />
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="horizontal" class="h-full w-full">
      {#if shell.leftPanelOpen}
        <Resizable.Pane
          class="flex"
          defaultSize={initialSize}
          minSize={10}
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

  <CommandPalette projects={projectStore.projects} onNewAgent={() => (newAgentOpen = true)} onTasks={() => (taskBoardOpen = true)} />
  <UpdateBanner />

  <SettingsDialog />
  <CompareDialog />
  <TaskBoard bind:open={taskBoardOpen} projects={projectStore.projects} />
  {#if newAgentProject}
    <AgentDialog bind:open={newAgentOpen} project={newAgentProject} />
  {/if}
  {#if fanoutProject}
    <FanoutDialog
      open={composer.fanoutOpen}
      onOpenChange={(value) => composer.setFanoutOpen(value)}
      project={fanoutProject}
      seed={composer.seed}
    />
  {/if}
</div>
