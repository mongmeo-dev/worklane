<!-- src/lib/components/shell/AgentDialog.svelte -->
<!-- 에이전트 추가 다이얼로그: kind 선택 시 실행 커맨드를 기본값으로 자동 채운다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { canCreateWorkspace, requiresCommand, resolveWorkspaceTitle } from "./agentDialogModel";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { t } from "$lib/i18n";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let title = $state("");
  let kind = $state<AgentKind>(agentKindStore.selectableKindIds[0]);
  let command = $state(agentKindStore.defaultCommandOf(agentKindStore.selectableKindIds[0]));
  let branch = $state("");
  let startPoint = $state("main");
  let worktreePath = $state("");
  let error = $state("");

  // kind 변경 시 command를 해당 기본값으로 자동 채움 (사용자가 이후 수정 가능).
  function onKindChange(v: string) {
    kind = v as AgentKind;
    command = agentKindStore.defaultCommandOf(kind);
  }

  async function submit() {
    error = "";
    try {
      const effectiveBranch = branch.trim();
      const agent = await projectStore.addAgent({
        projectId: project.id,
        projectPath: project.path,
        title: resolveWorkspaceTitle(title, effectiveBranch),
        kind,
        command: command.trim(),
        branch: effectiveBranch,
        startPoint: startPoint.trim(),
        worktreePath: worktreePath.trim() || undefined,
      });
      shell.selectAgent(agent.id);
      open = false;
      title = ""; branch = ""; worktreePath = "";
    } catch (e) {
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("agentDialog.title", { project: project.name })}</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="ag-title">{t("agentDialog.taskName")}</Label>
        <Input id="ag-title" bind:value={title} placeholder={t("agentDialog.taskNamePlaceholder")} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{t("agentDialog.kind")}</Label>
        <Select.Root type="single" value={kind} onValueChange={onKindChange}>
          <Select.Trigger>{agentKindStore.labelOf(kind)}</Select.Trigger>
          <Select.Content>
            {#each agentKindStore.selectableKindIds as k (k)}
              <Select.Item value={k}>{agentKindStore.labelOf(k)}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-cmd">{requiresCommand(kind) ? t("agentDialog.command") : t("agentDialog.commandOptional")}</Label>
        <Input id="ag-cmd" bind:value={command} placeholder={requiresCommand(kind) ? "" : t("agentDialog.commandPlaceholderShell")} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-branch">{t("agentDialog.branch")}</Label>
        <Input id="ag-branch" bind:value={branch} placeholder={t("agentDialog.branchPlaceholder")} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-start">{t("agentDialog.startPoint")}</Label>
        <Input id="ag-start" bind:value={startPoint} placeholder={t("agentDialog.startPlaceholder")} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-wt">{t("agentDialog.worktreePath")}</Label>
        <Input id="ag-wt" bind:value={worktreePath} placeholder={t("agentDialog.worktreePathPlaceholder")} />
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={!canCreateWorkspace({ title, kind, command, branch, startPoint })}>
        {t("common.add")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
