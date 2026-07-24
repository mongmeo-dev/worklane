<!-- src/lib/components/shell/AgentDialog.svelte -->
<!-- 에이전트 추가 다이얼로그: kind 선택 시 실행 커맨드를 기본값으로 자동 채운다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindLabels, agentKindDefaults, agentKinds } from "$lib/data/labels";
  import { canCreateWorkspace, requiresCommand } from "./agentDialogModel";
  import { projectStore } from "$lib/stores/projects.svelte";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let title = $state("");
  let kind = $state<AgentKind>("claude-code");
  let command = $state(agentKindDefaults["claude-code"]);
  let branch = $state("");
  let startPoint = $state("main");
  let worktreePath = $state("");
  let worktreeMode = $state("new");
  let error = $state("");

  // kind 변경 시 command를 해당 기본값으로 자동 채움 (사용자가 이후 수정 가능).
  function onKindChange(v: string) {
    kind = v as AgentKind;
    command = agentKindDefaults[kind];
  }

  async function submit() {
    error = "";
    try {
      const sharedAgent = project.agents.find((agent) => agent.id === worktreeMode);
      await projectStore.addAgent({
        projectId: project.id,
        projectPath: project.path,
        title: title.trim(),
        kind,
        command: command.trim(),
        branch: sharedAgent?.branch ?? branch.trim(),
        startPoint: sharedAgent?.branch ?? startPoint.trim(),
        shareWorktree: Boolean(sharedAgent),
        worktreePath: sharedAgent?.worktreePath ?? (worktreePath.trim() || undefined),
      });
      open = false;
      title = ""; branch = ""; worktreePath = ""; worktreeMode = "new";
    } catch (e) {
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>에이전트 추가 — {project.name}</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="ag-title">작업 이름</Label>
        <Input id="ag-title" bind:value={title} placeholder="예: 로그인 리팩터링" />
      </div>
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
        <Label for="ag-cmd">실행 커맨드{requiresCommand(kind) ? "" : " (선택)"}</Label>
        <Input id="ag-cmd" bind:value={command} placeholder={requiresCommand(kind) ? "" : "비우면 기본 셸이 열립니다"} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>worktree</Label>
        <Select.Root type="single" value={worktreeMode} onValueChange={(value) => (worktreeMode = value)}>
          <Select.Trigger>{worktreeMode === "new" ? "새 worktree 만들기" : `${project.agents.find((agent) => agent.id === worktreeMode)?.branch ?? "기존 worktree"} 공유`}</Select.Trigger>
          <Select.Content>
            <Select.Item value="new">새 worktree 만들기</Select.Item>
            {#each project.agents as existing (existing.id)}
              <Select.Item value={existing.id}>{existing.branch} · {existing.title}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        {#if worktreeMode !== "new"}<p class="text-[10px] text-accent-share">선택한 에이전트와 동일한 물리적 worktree를 사용합니다.</p>{/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-branch">브랜치</Label>
        <Input id="ag-branch" bind:value={branch} placeholder="예: feat/login" disabled={worktreeMode !== "new"} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-start">분기 기준(start-point)</Label>
        <Input id="ag-start" bind:value={startPoint} placeholder="예: main" disabled={worktreeMode !== "new"} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="ag-wt">worktree 경로 (비우면 자동 생성)</Label>
        <Input id="ag-wt" bind:value={worktreePath} placeholder="선택 사항" disabled={worktreeMode !== "new"} />
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={!canCreateWorkspace({ title, kind, command, branch, startPoint, worktreeMode })}>
        추가
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
