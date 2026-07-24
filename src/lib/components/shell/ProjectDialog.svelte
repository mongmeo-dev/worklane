<!-- src/lib/components/shell/ProjectDialog.svelte -->
<!-- 프로젝트 추가 다이얼로그: 이름 입력 + 네이티브 디렉토리 선택. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { agentKindDefaults, agentKindLabels, agentKinds } from "$lib/data/labels";
  import type { AgentKind } from "$lib/types";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state("");
  let path = $state("");
  let error = $state("");
  let kind = $state<AgentKind>("claude-code");
  let submitting = $state(false);

  async function pickDir() {
    const selected = await openDialog({ directory: true });
    if (typeof selected === "string") {
      path = selected;
      if (!name) name = selected.split("/").pop() ?? "";
    }
  }

  async function submit() {
    if (submitting) return;
    error = "";
    submitting = true;
    try {
      const project = await projectStore.addProject(
        name.trim(),
        path.trim(),
        kind,
        agentKindDefaults[kind],
      );
      const defaultAgent = project.agents[0];
      if (defaultAgent) shell.selectAgent(defaultAgent.id);
      open = false;
      name = "";
      path = "";
      kind = "claude-code";
    } catch (e) {
      error = String(e);
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>프로젝트 추가</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="proj-name">이름</Label>
        <Input id="proj-name" bind:value={name} placeholder="프로젝트 이름" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>첫 작업환경 에이전트</Label>
        <Select.Root
          type="single"
          value={kind}
          onValueChange={(value) => (kind = value as AgentKind)}
        >
          <Select.Trigger>{agentKindLabels[kind]}</Select.Trigger>
          <Select.Content>
            {#each agentKinds as value (value)}
              <Select.Item value={value}>{agentKindLabels[value]}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-[10px] text-muted-foreground">
          기존 프로젝트 디렉터리와 현재 checkout 브랜치를 그대로 사용합니다.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="proj-path">경로</Label>
        <div class="flex gap-2">
          <Input id="proj-path" bind:value={path} placeholder="로컬 저장소 경로" readonly />
          <Button variant="secondary" onclick={pickDir}>선택</Button>
        </div>
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={submitting || !name.trim() || !path.trim()}>
        {submitting ? "추가 중…" : "추가"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
