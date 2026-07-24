<!-- src/lib/components/shell/DefaultWorkspaceDialog.svelte -->
<!-- 기본 작업환경 복구 다이얼로그: 삭제된 기본 작업환경을 저장소의 현재 브랜치로 다시 만든다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindLabels, agentKindDefaults, agentKinds } from "$lib/data/labels";
  import { requiresCommand } from "./agentDialogModel";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let kind = $state<AgentKind>("claude-code");
  let command = $state(agentKindDefaults["claude-code"]);
  let error = $state("");
  let submitting = $state(false);

  // kind 변경 시 command를 해당 기본값으로 자동 채움 (사용자가 이후 수정 가능).
  function onKindChange(v: string) {
    kind = v as AgentKind;
    command = agentKindDefaults[kind];
  }

  async function submit() {
    if (submitting) return;
    error = "";
    submitting = true;
    try {
      const agent = await projectStore.addDefaultWorkspace(project.id, kind, command.trim());
      shell.selectAgent(agent.id);
      open = false;
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
      <Dialog.Title>기본 작업환경 다시 만들기 — {project.name}</Dialog.Title>
      <Dialog.Description>저장소 본체의 현재 checkout 브랜치에서 동작하는 기본 작업환경을 다시 만듭니다.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label>종류</Label>
        <Select.Root type="single" value={kind} onValueChange={onKindChange}>
          <Select.Trigger>{agentKindLabels[kind]}</Select.Trigger>
          <Select.Content>
            {#each agentKinds as k (k)}
              <Select.Item value={k}>{agentKindLabels[k]}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="dw-cmd">실행 커맨드{requiresCommand(kind) ? "" : " (선택)"}</Label>
        <Input id="dw-cmd" bind:value={command} placeholder={requiresCommand(kind) ? "" : "비우면 기본 셸이 열립니다"} />
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={submitting || (requiresCommand(kind) && !command.trim())}>다시 만들기</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
